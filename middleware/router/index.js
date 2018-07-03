const koaRouter = require('koa-router');
const koaCompose = require('koa-compose');
const requestHandler = require('./requestHandler');
module.exports = ({port, options, swaggerDocument}) => {
    const router = koaRouter(options);
    Object.keys(swaggerDocument.paths).forEach(path => {
        const fullPath = [swaggerDocument.basePath, path].filter(x => x).join('');
        const collection = swaggerDocument.paths[path];
        Object.keys(collection).forEach(methodName => {
            const method = collection[methodName];
            if (!method['x-bus-method']) {
                throw port.errors['swagger.noXBusMethod']({method});
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
            router[methodName](fullPath, requestHandler({
                port,
                method: method['x-bus-method'],
                successCode: successCodes[0] ? parseInt(successCodes[0]) : 200
            }));
        });
    });
    return koaCompose([
        router.routes(),
        router.allowedMethods()
    ]);
};
