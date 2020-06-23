declare module 'data-api-client' {
    import type { ClientConfiguration } from 'aws-sdk/clients/rdsdataservice';

    export interface iParams {
        secretArn: string;
        resourceArn: string;
        database?: string;
        keepAlive?: boolean;
        hydrateColumnNames?: boolean;
        sslEnabled?: boolean;
        options?: ClientConfiguration;
        region?: string;
    }

    interface iTransaction {
        query: iQuery<iTransaction>;
        rollback: (error: Error, status: any) => void;
        commit: () => Promise<void>;
    }

    interface iQuery<T> {
        (sql: string, params?: [] | unknown): Promise<T>; // params can be [] or {}
        (obj: { sql: string; parameters: [] | unknown; database?: string; hydrateColumnNames?: boolean }): Promise<T>;
    }

    export interface iDataAPIClient {
        query: iQuery<iDataAPIQueryResult>;
        transaction(): iTransaction; // needs to return an interface with

        // promisified versions of the RDSDataService methods
        // TODO add actual return types
        batchExecuteStatement: (...args) => Promise<any>;
        beginTransaction: (...args) => Promise<any>;
        commitTransaction: (...args) => Promise<any>;
        executeStatement: (...args) => Promise<any>;
        rollbackTransaction: (...args) => Promise<any>;
    }

    export interface iDataAPIQueryResult {
        records: Array<any>;
    }

    export default function (params: iParams): iDataAPIClient;
}
