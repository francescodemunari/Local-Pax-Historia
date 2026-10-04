// Consistent errors for save mutations, including requests awaiting an AI reply.
function respondWithError(res, error) {
    const statuses = {
        INVALID_SAVE_ID: 400,
        INVALID_TIME_JUMP: 400,
        INVALID_START_DATE: 400,
        INVALID_SAVE_NAME: 400,
        SAVE_NOT_FOUND: 404,
        TURN_IN_PROGRESS: 409,
        SAVE_CONFLICT: 409,
        LLM_UNAVAILABLE: 503,
        GAME_MASTER_UNAVAILABLE: 503,
        GAME_MASTER_INVALID_RESPONSE: 503
    };
    return res.status(statuses[error.code] || 500).json({ error: error.message, code: error.code });
}

module.exports = respondWithError;
