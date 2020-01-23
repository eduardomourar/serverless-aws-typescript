import middy from 'middy';
import { cors, ICorsOptions } from 'middy/middlewares';

export function CorsMiddlewareHandler(corsOptions: ICorsOptions = {
        origin: '*',
        headers: '*'
    }) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor => {
        descriptor.value = middy(descriptor.value).use(cors(corsOptions));
        return descriptor;
    }
}
