declare module 'data-api-client' {
    import type RDSDataService from 'aws-sdk/clients/rdsdataservice';
    import type { ClientConfiguration } from 'aws-sdk/clients/rdsdataservice';

    export interface iParams {
        secretArn: string;
        resourceArn: string;
        database: string;
        keepAlive?: boolean;
        hydrateColumnNames?: boolean;
        sslEnabled?: boolean;
        options?: ClientConfiguration;
        region?: string;
    }

    export interface iDataAPIClient {
        query(...x: any[]): Promise<iDataAPIQueryResult>;
    }

    export interface iDataAPIQueryResult {
        records: Array<any>;
    }

    export default function (params: iParams): iDataAPIClient;
}

