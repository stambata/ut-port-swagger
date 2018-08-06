const koaRouter = require('koa-router');
const koaCompose = require('koa-compose');
const sanitize = (path) => {
    // transform path parameter definitions from swagger 2 to koa 2 standard: /{id} -> /:id
    return path.replace(/\{([^}]*)\}/g, (placeHolder, label) => `:${label}`);
};
module.exports = ({port, options}) => {
    const router = koaRouter(options);
    Object.keys(port.swaggerDocument.paths).forEach(path => {
        const fullPath = [port.swaggerDocument.basePath, sanitize(path)].filter(x => x).join('');
        const collection = port.swaggerDocument.paths[path];
        Object.keys(collection).forEach(methodName => {
            const method = collection[methodName];
            if (!method['x-bus-method']) {
                throw port.errors['swagger.xBusMethodNotDefined']({method});
            }
            const successCodes = Object.keys(method.responses).filter(code => code >= 200 && code < 300);
            if (successCodes.length > 1) {
                throw port.errors['swagger.successCodesCount']({
                    params: {
                        expected: 1,
                        actual: successCodes.length
                    },
                    responses: method.responses
                });
            }
            router[methodName](fullPath, (ctx, next) => {
                ctx.ut.method = method['x-bus-method'];
                ctx.ut.successCode = successCodes[0] ? parseInt(successCodes[0]) : 200;
                return next();
            });
        });
    });
    return koaCompose([
        router.routes(),
        router.allowedMethods(),
        (ctx, next) => {
            if (!ctx.ut.method) {
                ctx.status = 404;
                const error = port.errors['swagger.routeNotFound']();
                ctx.body = {error};
                throw error;
            }
            return next();
        }
    ]);
};
