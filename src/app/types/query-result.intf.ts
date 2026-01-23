export interface QuerySerializationResult {
    success: boolean
    serializedContent: string
    error?: {
        message: string
        query: string
    }
}
