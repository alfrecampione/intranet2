import { Prisma } from '@prisma/client';

/**
 * Centralized error handling middleware
 * Converts Prisma errors and other errors into user-friendly messages
 */
export const errorHandler = (err, req, res, next) => {
    // Prisma Error: Known request error
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        const meta = err.meta || {};

        switch (err.code) {
            case 'P2002':
                // Unique constraint violation
                const fields = meta.target || ['field'];
                const fieldList = Array.isArray(fields) ? fields.join(', ') : fields;
                return res.status(409).json({
                    success: false,
                    error: 'Duplicate Entry',
                    message: `A record with this ${fieldList} already exists. Please use a different value.`,
                    debug: {
                        code: err.code,
                        fields: fields,
                        model: meta.modelName || meta.target,
                    }
                });

            case 'P2025':
                // Record not found
                const cause = meta.cause || 'Record to update not found';
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'The requested record was not found.',
                    debug: {
                        code: err.code,
                        cause: cause,
                        model: meta.modelName,
                    }
                });

            case 'P2003':
                // Foreign key constraint failed
                const fieldName = meta.field_name || 'reference';
                return res.status(400).json({
                    success: false,
                    error: 'Invalid Reference',
                    message: `The referenced record does not exist (${fieldName}).`,
                    debug: {
                        code: err.code,
                        field: fieldName,
                        constraint: meta.constraint,
                    }
                });

            case 'P2014':
                // Required relation violation
                const relation = meta.relation_name || 'relation';
                return res.status(400).json({
                    success: false,
                    error: 'Missing Relationship',
                    message: `A required relationship is missing: ${relation}.`,
                    debug: {
                        code: err.code,
                        relation: relation,
                        model: meta.model_name,
                    }
                });

            case 'P2021':
                // Table does not exist
                const tableName = meta.table || 'unknown';
                return res.status(500).json({
                    success: false,
                    error: 'Database Error',
                    message: 'A database table is missing. Please contact support.',
                    debug: {
                        code: err.code,
                        table: tableName,
                    }
                });

            case 'P2022':
                // Column does not exist
                const columnName = meta.column || 'unknown';
                return res.status(500).json({
                    success: false,
                    error: 'Database Error',
                    message: 'A database column is missing. Please contact support.',
                    debug: {
                        code: err.code,
                        column: columnName,
                        table: meta.table,
                    }
                });

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Database Error',
                    message: 'An error occurred while processing your request.',
                    debug: {
                        code: err.code,
                        message: err.message,
                        meta: meta,
                    }
                });
        }
    }

    // Prisma validation error
    if (err instanceof Prisma.PrismaClientValidationError) {
        // Extract model name from error message if available
        const modelMatch = err.message.match(/model `?(\w+)`?/i);
        const model = modelMatch ? modelMatch[1] : null;

        return res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: 'Invalid data provided. Please check your input and try again.',
            debug: {
                model: model,
                details: err.message,
            }
        });
    }

    // Prisma initialization error
    if (err instanceof Prisma.PrismaClientInitializationError) {
        return res.status(503).json({
            success: false,
            error: 'Service Unavailable',
            message: 'Database connection failed. Please try again later.',
            debug: {
                errorCode: err.errorCode,
                message: err.message,
            }
        });
    }

    // Prisma connection error
    if (err instanceof Prisma.PrismaClientRustPanicError) {
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'A critical database error occurred. Please contact support.',
            debug: {
                message: err.message,
            }
        });
    }

    // Custom errors with status
    if (err.status || err.statusCode) {
        const status = err.status || err.statusCode;
        return res.status(status).json({
            success: false,
            error: err.name || 'Error',
            message: err.message || 'An error occurred.',
        });
    }

    // Generic validation error
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: err.message || 'Invalid data provided.',
        });
    }

    // Authorization error
    if (err.name === 'UnauthorizedError' || err.message.includes('unauthorized')) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'You are not authorized to perform this action.',
        });
    }

    // Generic error
    return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
        debug: {
            name: err.name,
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        }
    });
};

/**
 * Wrapper for async functions that automatically passes errors to errorHandler
 * Usage: router.post('/route', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
