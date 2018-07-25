const swaggerParser = require('swagger-parser');
const validator = require('./validator');
module.exports = async function compile(swaggerDocument) {
    const swagger = await swaggerParser.dereference(swaggerDocument);
    const basePath = swagger.basePath || '';
    const validators = [];
    Object.keys(swagger.paths).forEach(pathName => {
        const path = swagger.paths[pathName];
        const methodNames = Object.keys(path).filter(methodName => methodName !== 'parameters');
        methodNames.forEach(methodName => {
            const method = path[methodName];
            const params = []
                .concat(path.parameters)
                .concat(method.parameters)
                .filter(x => x)
                .map(param => {
                    const schema = param.schema || param;
                    if (['query', 'header', 'path'].indexOf(param.in) !== -1) {
                        param.validate = validator.primitive(schema);
                    } else if (param.in === 'formData' && param.type === 'file') {
                        param.validate = validator.file(schema);
                    } else {
                        param.validate = validator.json(schema);
                    }
                    return param;
                });
            const responses = Object.keys(method.responses).reduce((all, res) => {
                const response = method.responses[res];
                all[res] = Object.assign({}, response, {
                    validate: response.schema ? validator.json(response.schema) : validator.empty()
                });
                return all;
            }, {});
            const regExp = new RegExp(`^${basePath.replace(/\/*$/, '')}${pathName.replace(/\{[^}]*}/g, '[^/]+')}/?.${methodName}$`, 'i');
            const expected = (pathName.match(/[^/]+/g) || []).map(s => s.toString());
            validators.push((path, method) => {
                return regExp.test(`${path}.${method}`) && {
                    request: async function validateRequest({
                        query = {},
                        body = {},
                        files = {},
                        pathParameters = {},
                        headers = {}
                    }) {
                        const errors = [];
                        if (params.length === 0) {
                            const error = await validator.empty()(body);
                            if (error) {
                                error.where = 'body';
                                errors.push(error);
                            }
                            Object.keys(query).forEach(name => {
                                errors.push({
                                    where: 'query',
                                    name,
                                    actual: query[name],
                                    expected: undefined
                                });
                            });
                        } else {
                            let hasBody = false;
                            for (let i = 0; i < params.length; i += 1) {
                                let value;
                                const param = params[i];
                                switch (param.in) {
                                    case 'query':
                                        value = query[param.name];
                                        break;
                                    case 'path':
                                        if (pathParameters) {
                                            value = pathParameters[param.name];
                                        } else {
                                            const requestPath = basePath ? path.substring(basePath.length) : path;
                                            const actual = requestPath.match(/[^/]+/g);
                                            value = actual ? actual[expected.indexOf(`{${param.name}}`)] : undefined;
                                        }
                                        break;
                                    case 'formData':
                                        value = param.type === 'file' ? files[param.name] : body[param.name];
                                        hasBody = true;
                                        break;
                                    case 'body':
                                        value = body;
                                        hasBody = true;
                                        break;
                                    case 'headers':
                                        value = headers[param.name];
                                        hasBody = true;
                                        break;
                                }
                                const error = await param.validate(value);
                                error && errors.push(error);
                            }
                            if (!hasBody && body !== undefined) {
                                const error = await validator.empty()(body);
                                error && errors.push(error);
                            }
                        }
                        return errors;
                    },
                    response: async function validateResponse({status, body}) {
                        const validate = (responses[status] || responses.default).validate;
                        const error = await validate(body);
                        return error ? [error] : [];
                    }
                };
            });
        });
    });
    return {
        getValidator(path, method) {
            let validator;
            let match;
            for (let i = 0; i < validators.length; i += 1) {
                match = validators[i](path, method);
                if (match) {
                    if (!validator) {
                        validator = match;
                    } else { // it should match just once
                        return;
                    }
                }
            }
            return validator;
        }
    };
};
