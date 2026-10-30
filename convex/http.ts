import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { openPdfHttp } from './nativeFiles';

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ pathPrefix: '/files/', method: 'GET', handler: openPdfHttp });

export default http;
