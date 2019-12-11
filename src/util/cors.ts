import { Handler } from 'aws-lambda';
import middy from 'middy';
import { cors, ICorsOptions } from 'middy/middlewares';

const corsOptions: ICorsOptions = {
    origin: '*',
    headers: '*'
};

export const enableCors = (handler: Handler) => middy(handler).use(cors(corsOptions));
