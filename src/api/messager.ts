import { logger } from '../util/logger';

export class Messager {
    constructor(
    ) {
    }

    public async list(recipient: string): Promise<any> {
        logger.debug('"Messager.list": recipient',recipient);
        
        return [
            {
                'recipient': recipient,
            }
        ];
    }
}
