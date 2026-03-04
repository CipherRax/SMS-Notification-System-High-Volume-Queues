export interface SendSMSResult {
  providerMessaageId: string
  status: 'success' | 'failed' | 'pending'
  errorCode?: string
  errorMessage?: string
  const?: number
  currency?: string
  latencyMs: number
}
