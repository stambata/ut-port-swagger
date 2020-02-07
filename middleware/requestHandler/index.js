module.exports = ({port, options}) => {
    const { authorize, '*.request': defaultRequest, '*.response': defaultResponse } = options;
    return async(ctx, next) => {
        const { $meta, successCode } = ctx.ut;
        const { params, query, path } = ctx;
        const { body, files } = ctx.request;
        const message = ctx.ut.msg = Object.assign(
            {},
            Array.isArray(body) ? {list: body} : body,
            files,
            params,
            query
        );
        if (port.log.trace) {
            port.log.trace({
                details: {
                    body,
                    files,
                    params,
                    query,
                    path
                },
                message,
                $meta
            });
        }
        switch (typeof authorize) {
            case 'function':
                try {
                    const result = await authorize({message, $meta});
                    if (!result) {
                        ctx.status = 401;
                        throw port.errors['swagger.authorizationError']();
                    }
                } catch (e) {
                    ctx.status = 401;
                    throw port.errors['swagger.authorizationError'](e);
                }
                break;
            case 'string':
                await new Promise((resolve, reject) => {
                    port.stream.push([{message, $meta}, {
                        mtid: 'request',
                        method: authorize,
                        reply: (response, {mtid}) => {
                            switch (mtid) {
                                case 'response':
                                    if (!response) {
                                        ctx.status = 401;
                                        return reject(port.errors['swagger.authorizationError']());
                                    }
                                    return resolve();
                                case 'error':
                                    ctx.status = 401;
                                    return reject(port.errors['swagger.authorizationError'](response));
                                default:
                                    ctx.status = 401;
                                    return reject(port.errors['swagger.authorizationError']({ cause: response }));
                            }
                        }
                    }]);
                });
                break;
            default:
                break;
        }
        return new Promise((resolve, reject) => {
            $meta.reply = (response, {responseHeaders, cookies, mtid}) => {
                if (responseHeaders) {
                    Object.keys(responseHeaders).forEach(header => {
                        ctx.set(header, responseHeaders[header]);
                    });
                }

                if (Array.isArray(cookies)) cookies.forEach(cookie => ctx.cookies.set(...cookie));

                switch (mtid) {
                    case 'response':
                        ctx.body = (defaultResponse && defaultResponse(response)) || response;
                        ctx.status = successCode;
                        return resolve(next());
                    case 'error':
                        ctx.status = (response.details && response.details.statusCode) || 400;
                        return reject((defaultResponse && defaultResponse(response)) || response);
                    default:
                        ctx.status = 400;
                        return reject(port.errors.swagger({
                            cause: response
                        }));
                }
            };
            if (defaultRequest) {
                port.stream.push([defaultRequest(message), $meta]);
            }
            port.stream.push([message, $meta]);
        });
    };
};
