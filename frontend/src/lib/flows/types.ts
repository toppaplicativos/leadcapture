export interface FlowNode {
  id: string
  type: string
  subtype: string
  label: string
  data: Record<string, any>
  phaseId?: string
}

export interface FlowConnection {
  id: string
  from: string
  fromHandle: string
  to: string
}

export interface FlowPhase {
  id: string
  name: string
  description?: string
  color?: string
  order?: number
}

export interface Flow {
  id: string
  name: string
  status: string
  description?: string
  brand_id?: string | null
  nodes: FlowNode[]
  connections: FlowConnection[]
  phases?: FlowPhase[]
  published_version?: number
  has_published?: boolean
  concurrency_policy?: string
  created_at?: string
  updated_at?: string
}

export interface FlowExecution {
  id: string
  flow_id?: string
  status: string
  trigger_subtype: string
  started_at?: string
  finished_at?: string
  last_node_id?: string | null
  error_message?: string | null
  steps_timeline?: Array<{
    node_id: string
    node_subtype: string
    at: string
    output_handle?: string | null
  }>
  context?: Record<string, any>
}

export interface FlowSession {
  id: string
  flow_id: string
  execution_id: string
  contact_key: string
  status: string
  waiting_node_id?: string | null
  current_node_id?: string | null
  published_version?: number
  expires_at?: string | null
  last_inbound_at?: string | null
  updated_at?: string
}

export type FlowStatusFilter = 'all' | 'active' | 'draft' | 'paused'
