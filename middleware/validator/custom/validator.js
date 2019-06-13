const Ajv = require('../ajv');
const ajv = new Ajv({allErrors: true, $data: true, useDefaults: true});
const getValidationHandler = originalSchema => {
    const schema = {...originalSchema, $async: true}; // don't override by reference
    if (typeof schema.required === 'boolean') {
        schema['x-required'] = schema.required; // json schema 4 support
        delete schema.required;
    }
    const validate = ajv.compile(schema);
    return async value => {
        let error;
        try {
            await validate(value);
        } catch (e) {
            error = e;
        }
        return error;
    };
};
const collectionFormats = {
    csv: ',',
    ssv: ' ',
    tsv: '\t',
    pipes: '|'
};

module.exports = {
    empty: () => {
        return getValidationHandler({
            oneOf: [
                {
                    type: 'null'
                },
                {
                    type: 'string',
                    maxLength: 0
                },
                {
                    type: 'object',
                    additionalProperties: false,
                    properties: {}
                }
            ]
        });
    },
    file: schema => {
        return getValidationHandler({
            in: schema.in,
            name: schema.name,
            description: schema.description,
            required: schema.required,
            'x-file': true
        });
    },
    json: schema => {
        return getValidationHandler(schema);
    },
    primitive: schema => {
        const validate = getValidationHandler(schema);
        return value => { // normalize value
            if (typeof value !== 'undefined') {
                switch (schema.type) {
                    case 'number':
                    case 'integer':
                        if (!isNaN(value)) {
                            value = +value;
                        }
                        break;
                    case 'boolean':
                        if (value === 'true') {
                            value = true;
                        } else if (value === 'false') {
                            value = false;
                        }
                        break;
                    case 'array':
                        if (!Array.isArray(value)) {
                            const format = collectionFormats[schema.collectionFormat || 'csv'];
                            value = format ? String(value).split(format) : [value];
                        }
                        switch (schema.items.type) {
                            case 'number':
                            case 'integer':
                                value = value.map(v => isNaN(v) ? v : +v);
                                break;
                            case 'boolean':
                                value = value.map(v => v === 'true' ? true : v === 'false' ? false : v);
                                break;
                            default:
                                break;
                        }
                        break;
                    default:
                        break;
                }
            } else if (!schema['x-required']) {
                return;
            }
            return validate(value);
        };
    }
};