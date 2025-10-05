'use strict'

/*
 * This module provides a simplified interface into the Aurora Serverless
 * Data API by abstracting away the notion of field values.
 *
 * More detail regarding the Aurora Serverless Data API can be found here:
 * https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html
 *
 * @author Jeremy Daly <jeremy@jeremydaly.com>
 * @version 2.0.0
 * @license MIT
 */

// Export the init function as the default export for backward compatibility
import { init } from './client'
export = init
