const jwt = require('koa-jwt');
const koaCompose = require('koa-compose');
const { koaJwtSecret } = require('jwks-rsa');
const formats = {
    keycloak: require('./format/keycloak')
};
module.exports = ({port, options}) => {
    const { key = 'user' } = options;

    let normalize = x => x;

    if (options.format) {
        if (typeof options.format === 'function') {
            normalize = options.format;
        } else {
            normalize = formats[options.format];
        }
        if (typeof normalize !== 'function') throw new Error(`Unsupported jwt format: ${options.format}`);
        delete options.format;
    }

    if (options.jwks) {
        options.secret = koaJwtSecret(options.jwks);
        delete options.jwks;
    }

    return koaCompose([
        jwt(options).unless({
            custom: ctx => typeof ctx.ut.method === 'undefined'
        }),
        (ctx, next) => {
            try {
                ctx.ut.$meta.auth = normalize(ctx.state[key]);
            } catch (e) {
                throw port.errors['swagger.jwtFormatError'](e);
            }
            return next();
        }
    ]);
};
