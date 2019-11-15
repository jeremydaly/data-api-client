'use strict'

/*
 * This module provides a simplified interface into the Aurora Serverless
 * Data API by abstracting away the notion of field values.
 *
 * More detail regarding the Aurora Serverless Data APIcan be found here:
 * https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html
 *
 * @author Jeremy Daly <jeremy@jeremydaly.com>
 * @version 1.0.0-beta
 * @license MIT
 */

// Require the aws-sdk. This is a dev dependency, so if being used
// outside of a Lambda execution environment, it must be manually installed.
const AWS = require('aws-sdk')

// Require sqlstring to add additional escaping capabilities
const sqlString = require('sqlstring')

// Supported value types in the Data API
const supportedTypes = [
  'arrayValue',
  'blobValue',
  'booleanValue',
  'doubleValue',
  'isNull',
  'longValue',
  'stringValue',
  'structValue'
]

/**********************************************************************/
/** Enable HTTP Keep-Alive per https://vimeo.com/287511222          **/
/** This dramatically increases the speed of subsequent HTTP calls  **/
/**********************************************************************/

const https = require('https')

const sslAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50, // same as aws-sdk
  rejectUnauthorized: true  // same as aws-sdk
})
sslAgent.setMaxListeners(0) // same as aws-sdk


/********************************************************************/
/**  PRIVATE METHODS                                               **/
/********************************************************************/

// Simple error function
const error = (...err) => { throw Error(...err) }

// Parse SQL statement from provided arguments
const parseSQL = args =>
  typeof args[0] === 'string' ? args[0]
  : typeof args[0] === 'object' && typeof args[0].sql === 'string' ? args[0].sql
  : error('No \'sql\' statement provided.')

// Parse the parameters from provided arguments
const parseParams = args =>
  Array.isArray(args[0].parameters) ? args[0].parameters
  : typeof args[0].parameters === 'object' ? [args[0].parameters]
  : Array.isArray(args[1]) ? args[1]
  : typeof args[1] === 'object' ? [args[1]]
  : args[0].parameters ? error('\'parameters\' must be an object or array')
  : args[1] ? error('Parameters must be an object or array')
  : []

// Parse the supplied database, or default to config
const parseDatabase = (config,args) =>
  config.transactionId ? config.database
  : typeof args[0].database === 'string' ? args[0].database
  : args[0].database ? error('\'database\' must be a string.')
  : config.database ? config.database
  : error('No \'database\' provided.')

// Parse the supplied hydrateColumnNames command, or default to config
const parseHydrate = (config,args) =>
  typeof args[0].hydrateColumnNames === 'boolean' ? args[0].hydrateColumnNames
  : args[0].hydrateColumnNames ? error('\'hydrateColumnNames\' must be a boolean.')
  : config.hydrateColumnNames

// Prepare method params w/ supplied inputs if an object is passed
const prepareParams = ({ secretArn,resourceArn },args) => {
  return Object.assign(
    { secretArn,resourceArn }, // return Arns
    typeof args[0] === 'object' ?
      omit(args[0],['hydrateColumnNames','parameters']) : {} // merge any inputs
  )
}

// Utility function for removing certain keys from an object
const omit = (obj,values) => Object.keys(obj).reduce((acc,x) =>
  values.includes(x) ? acc : Object.assign(acc,{ [x]: obj[x] })
,{})

// Utility function for picking certain keys from an object
const pick = (obj,values) => Object.keys(obj).reduce((acc,x) =>
  values.includes(x) ? Object.assign(acc,{ [x]: obj[x] }) : acc
,{})

// Utility function for flattening arrays - deprecated
// const flatten = arr => arr.reduce((acc,x) => acc.concat(x),[])

// Normize parameters so that they are all in standard format
const normalizeParams = params => params.reduce((acc,p) =>
  Array.isArray(p) ? acc.concat([normalizeParams(p)])
  : Object.keys(p).length === 2 && p.name && p.value ? acc.concat(p)
  : acc.concat(splitParams(p))
,[]) // end reduce

// // Annotate parameters with correct types
// const annotateParams = params => params.reduce((acc,p) =>
//   Array.isArray(p) ? acc.concat([annotateParams(p)])
//     : Object.keys(p).length === 2 && p.name && p.value ? acc.concat(p)
//     : acc.concat(
//       formatParam(Object.keys(p)[0],Object.values(p)[0])
//     )
// ,[]) // end reduce


// Prepare parameters
const processParams = (sql,sqlParams,params,row=0) => {
  return {
    processedParams: params.reduce((acc,p) => {
      if (Array.isArray(p)) {
        let result = processParams(sql,sqlParams,p,row)
        if (row === 0) { sql = result.escapedSql; row++ }
        return acc.concat([result.processedParams])
      } else if (sqlParams[p.name]) {
        if (sqlParams[p.name].type === 'n_ph') {
          acc.push(formatParam(p.name,p.value))
        } else if (row === 0) {
          let regex = new RegExp('::' + p.name + '\\b','g')
          sql = sql.replace(regex,sqlString.escapeId(p.value))
        }
        return acc
      } else {
        return acc
      }
    },[]),
    escapedSql: sql
  }
}

// Converts parameter to the name/value format
const formatParam = (n,v) => formatType(n,v,getType(v))

// Converts object params into name/value format
const splitParams = p => Object.keys(p).reduce((arr,x) =>
  arr.concat({ name: x, value: p[x] }),[])

// Get all the sql parameters and assign them types
const getSqlParams = sql => {
  // TODO: probably need to remove comments from the sql
  // TODO: placeholders?
  // sql.match(/\:{1,2}\w+|\?+/g).map((p,i) => {
  return (sql.match(/:{1,2}\w+/g) || []).map((p) => {
    // TODO: future support for placeholder parsing?
    // return p === '??' ? { type: 'id' } // identifier
    //   : p === '?' ? { type: 'ph', label: '__d'+i  } // placeholder
    return p.startsWith('::') ? { type: 'n_id', label: p.substr(2) } // named id
      : { type: 'n_ph', label: p.substr(1) } // named placeholder
  }).reduce((acc,x) => {
    return Object.assign(acc,
      {
        [x.label]: {
          type: x.type
        }
      }
    )
  },{}) // end reduce
}

// Gets the value type and returns the correct value field name
// TODO: Support more types as the are released
const getType = val =>
  typeof val === 'string' ? 'stringValue'
  : typeof val === 'boolean' ? 'booleanValue'
  : typeof val === 'number' && parseInt(val) === val ? 'longValue'
  : typeof val === 'number' && parseFloat(val) === val ? 'doubleValue'
  : val === null ? 'isNull'
  : Buffer.isBuffer(val) ? 'blobValue'
  // : Array.isArray(val) ? 'arrayValue' This doesn't work yet
  // TODO: there is a 'structValue' now for postgres
  : typeof val === 'object'
    && Object.keys(val).length === 1
    && supportedTypes.includes(Object.keys(val)[0]) ? null
  : undefined

// Creates a standard Data API parameter using the supplied inputs
const formatType = (name,value,type) => {
  return Object.assign(
    { name },
    type === null ? { value }
    : {
      value: {
        [type ? type : error(`'${name}' is an invalid type`)]
        : type === 'isNull' ? true : value
      }
    }
  )
} // end formatType

// Formats the results of a query response
const formatResults = (
  { // destructure results
    columnMetadata, // ONLY when hydrate or includeResultMetadata is true
    numberOfRecordsUpdated, // ONLY for executeStatement method
    records, // ONLY for executeStatement method
    generatedFields, // ONLY for INSERTS
    updateResults // ONLY on batchExecuteStatement
  },
  hydrate,
  includeMeta
) =>
  Object.assign(
    includeMeta ? { columnMetadata } : {},
    numberOfRecordsUpdated !== undefined && !records ? { numberOfRecordsUpdated } : {},
    records ? {
      records: formatRecords(records, hydrate ? columnMetadata : false)
    } : {},
    updateResults ? { updateResults: formatUpdateResults(updateResults) } : {},
    generatedFields && generatedFields.length > 0 ?
      { insertId: generatedFields[0].longValue } : {}
  )

// Processes records and either extracts Typed Values into an array, or
// object with named column labels
const formatRecords = (recs,columns) => {

  // Create map for efficient value parsing
  let fmap = recs && recs[0] ? recs[0].map((x,i) => {
    return Object.assign({},
      columns ? { label: columns[i].label } : {} ) // add column labels
  }) : {}

  // Map over all the records (rows)
  return recs ? recs.map(rec => {

    // Reduce each field in the record (row)
    return rec.reduce((acc,field,i) => {

      // If the field is null, always return null
      if (field.isNull === true) {
        return columns ? // object if hydrate, else array
          Object.assign(acc,{ [fmap[i].label]: null })
          : acc.concat(null)

      // If the field is mapped, return the mapped field
      } else if (fmap[i] && fmap[i].field) {
        return columns ? // object if hydrate, else array
          Object.assign(acc,{ [fmap[i].label]: field[fmap[i].field] })
          : acc.concat(field[fmap[i].field])

      // Else discover the field type
      } else {

        // Look for non-null fields
        Object.keys(field).map(type => {
          if (type !== 'isNull' && field[type] !== null) {
            fmap[i]['field'] = type
          }
        })

        // Return the mapped field (this should NEVER be null)
        return columns ? // object if hydrate, else array
          Object.assign(acc,{ [fmap[i].label]: field[fmap[i].field] })
          : acc.concat(field[fmap[i].field])
      }

    }, columns ? {} : []) // init object if hydrate, else init array
  }) : [] // empty record set returns an array
} // end formatRecords

// Format updateResults and extract insertIds
const formatUpdateResults = res => res.map(x => {
  return x.generatedFields && x.generatedFields.length > 0 ?
    { insertId: x.generatedFields[0].longValue } : {}
})


// Merge configuration data with supplied arguments
const mergeConfig = (initialConfig,args) =>
  Object.assign(initialConfig,args)



/********************************************************************/
/**  QUERY MANAGEMENT                                              **/
/********************************************************************/

// Query function (use standard form for `this` context)
const query = async function(config,...args) {

  // Deprecated this since it was collapsing batches
  // const args = flatten(_args)

  // Parse and process sql
  const sql = parseSQL(args)
  const sqlParams = getSqlParams(sql)

  // Parse hydration setting
  const hydrateColumnNames = parseHydrate(config,args)

  // Parse and normalize parameters
  const parameters = normalizeParams(parseParams(args))

  // Process parameters and escape necessary SQL
  const { processedParams,escapedSql } = processParams(sql,sqlParams,parameters)

  // Determine if this is a batch request
  const isBatch = processedParams.length > 0
    && Array.isArray(processedParams[0]) ? true : false

  // Create/format the parameters
  const params = Object.assign(
    prepareParams(config,args),
    {
      database: parseDatabase(config,args), // add database
      sql: escapedSql // add escaped sql statement
    },
    // Only include parameters if they exist
    processedParams.length > 0 ?
      // Batch statements require parameterSets instead of parameters
      { [isBatch ? 'parameterSets' : 'parameters']: processedParams } : {},
    // Force meta data if set and not a batch
    hydrateColumnNames && !isBatch ? { includeResultMetadata: true } : {},
    // If a transactionId is passed, overwrite any manual input
    config.transactionId ? { transactionId: config.transactionId } : {}
  ) // end params

  try { // attempt to run the query

    // Capture the result for debugging
    let result = await (isBatch ? config.RDS.batchExecuteStatement(params).promise()
      : config.RDS.executeStatement(params).promise())

    // FOR DEBUGGING: console.log(JSON.stringify(result,null,2))

    // Format and return the results
    return formatResults(
      result,
      hydrateColumnNames,
      args[0].includeResultMetadata === true ? true : false
    )

  } catch(e) {

    if (this && this.rollback) {
      let rollback = await config.RDS.rollbackTransaction(
        pick(params,['resourceArn','secretArn','transactionId'])
      ).promise()

      this.rollback(e,rollback)
    }
    // Throw the error
    throw e
  }

} // end query



/********************************************************************/
/**  TRANSACTION MANAGEMENT                                        **/
/********************************************************************/

// Init a transaction object and return methods
const transaction = (config,_args) => {

  let args = typeof _args === 'object' ? [_args] : [{}]
  let queries = [] // keep track of queries
  let rollback = () => {} // default rollback event

  const txConfig = Object.assign(
    prepareParams(config,args),
    {
      database: parseDatabase(config,args), // add database
      hydrateColumnNames: parseHydrate(config,args), // add hydrate
      RDS: config.RDS // reference the RDSDataService instance
    }
  )

  return {
    query: function(...args) {
      if (typeof args[0] === 'function') {
        queries.push(args[0])
      } else {
        queries.push(() => [...args])
      }
      return this
    },
    rollback: function(fn) {
      if (typeof fn === 'function') { rollback = fn }
      return this
    },
    commit: async function() { return await commit(txConfig,queries,rollback) }
  }
}

// Commit transaction by running queries
const commit = async (config,queries,rollback) => {

  let results = [] // keep track of results

  // Start a transaction
  const { transactionId } = await config.RDS.beginTransaction(
    pick(config,['resourceArn','secretArn','database'])
  ).promise()

  // Add transactionId to the config
  let txConfig = Object.assign(config, { transactionId })

  // Loop through queries
  for (let i = 0; i < queries.length; i++) {
    // Execute the queries, pass the rollback as context
    let result = await query.apply({rollback},[config,queries[i](results[results.length-1],results)])
    // Add the result to the main results accumulator
    results.push(result)
  }

  // Commit our transaction
  const { transactionStatus } = await txConfig.RDS.commitTransaction(
    pick(config,['resourceArn','secretArn','transactionId'])
  ).promise()

  // Add the transaction status to the results
  results.push({transactionStatus})

  // Return the results
  return results
}

/********************************************************************/
/**  INSTANTIATION                                                 **/
/********************************************************************/

// Export main function
module.exports = (params) => {

  // Set the options for the RDSDataService
  const options = typeof params.options === 'object' ? params.options
    : params.options !== undefined ? error('\'options\' must be an object')
    : {}

  // Update the default AWS http agent with our new sslAgent
  if (typeof params.keepAlive === 'boolean' ? params.keepAlive : true) {
    AWS.config.update({ httpOptions: { agent: sslAgent } })
  }

  // Update the AWS http agent with the region
  if (typeof params.region === 'string') {
    AWS.config.update({ region: params.region })
  }

  // Disable ssl if wanted for local development
  if (params.sslEnabled === false) {
    // AWS.config.update({ sslEnabled: false })
    options.sslEnabled = false
  }


  // Set the configuration for this instance
  const config = {

    // Require secretArn
    secretArn: typeof params.secretArn === 'string' ?
      params.secretArn
      : error('\'secretArn\' string value required'),

    // Require resourceArn
    resourceArn: typeof params.resourceArn === 'string' ?
      params.resourceArn
      : error('\'resourceArn\' string value required'),

    // Load optional database
    database: typeof params.database === 'string' ?
      params.database
      : params.database !== undefined ? error('\'database\' must be a string')
      : undefined,

    // Load optional schema DISABLED for now since this isn't used with MySQL
    // schema: typeof params.schema === 'string' ? params.schema
    //   : params.schema !== undefined ? error(`'schema' must be a string`)
    //   : undefined,

    // Set hydrateColumnNames (default to true)
    hydrateColumnNames:
      typeof params.hydrateColumnNames === 'boolean' ?
        params.hydrateColumnNames : true,

    // TODO: Put this in a separate module for testing?
    // Create an instance of RDSDataService
    RDS: new AWS.RDSDataService(options)

  } // end config

  // Return public methods
  return {
    // Query method, pass config and parameters
    query: (...x) => query(config,...x),
    // Transaction method, pass config and parameters
    transaction: (x) => transaction(config,x),

    // Export promisified versions of the RDSDataService methods
    batchExecuteStatement: (args) =>
      config.RDS.batchExecuteStatement(
        mergeConfig(pick(config,['resourceArn','secretArn','database']),args)
      ).promise(),
    beginTransaction: (args) =>
      config.RDS.beginTransaction(
        mergeConfig(pick(config,['resourceArn','secretArn','database']),args)
      ).promise(),
    commitTransaction: (args) =>
      config.RDS.commitTransaction(
        mergeConfig(pick(config,['resourceArn','secretArn']),args)
      ).promise(),
    executeStatement: (args) =>
      config.RDS.executeStatement(
        mergeConfig(pick(config,['resourceArn','secretArn','database']),args)
      ).promise(),
    rollbackTransaction: (args) =>
      config.RDS.rollbackTransaction(
        mergeConfig(pick(config,['resourceArn','secretArn']),args)
      ).promise()
  }

} // end exports
