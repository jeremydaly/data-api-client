declare module 'data-api-client' {
    import type RDSDataService from 'aws-sdk/clients/rdsdataservice';
    import type { ConfigBase as Config } from 'aws-sdk/lib/config';
    export interface iParams extends RDSDataService.Types.ClientConfiguration {
        secretArn: string;
        resourceArn: string;
        database: string;
        keepAlive?: boolean;
        hydrateColumnNames?: boolean;
        options?: Config & RDSDataService.Types.ClientConfiguration;
    }

    export interface iDataAPIClient {
        query(...x: any[]): Promise<iDataAPIQueryResult>;
    }

    export interface iDataAPIQueryResult {
        records: Array<any>;
    }

    export default function (params: iParams): iDataAPIClient;
}

