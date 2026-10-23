import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { downloadHttp } from './nativeFiles';

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ pathPrefix: '/files/', method: 'GET', handler: downloadHttp });

export default http;
