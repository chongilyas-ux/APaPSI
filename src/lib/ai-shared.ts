import type { AssessmentData, Calculation, Configuration, Student } from "./domain";

export type ProviderName = "gemini" | "claude" | "openai";
export type AICommandState =
  | "IDLE"
  | "RECEIVING"
  | "PARSING"
  | "RESOLVING_CONTEXT"
  | "CLASSIFYING_INTENT"
  | "VALIDATING"
  | "EXECUTING_READ"
  | "VERIFYING_READ"
  | "PLANNING"
  | "PLAN_READY"
  | "WAITING_CONFIRMATION"
  | "REPLANNING"
  | "EXECUTING"
  | "VERIFYING"
  | "COMPLETED"
  | "NEEDS_CLARIFICATION"
  | "CANCELLED"
  | "ROLLED_BACK"
  | "ERROR";
export type ProviderStatus = {
  id: ProviderName;
  name: string;
  model: string;
  ready: boolean;
  paid: boolean;
  connection?: "untested" | "connected" | "failed";
};
export type AIContext = {
  pathname: string;
  rombel?: number;
  npm?: string;
  status?: string;
  dirty?: boolean;
};
export type ToolName =
  | "SEARCH_STUDENTS"
  | "GET_FINAL_SCORE"
  | "GET_MISSING_ASSESSMENTS"
  | "GET_RUBRIC"
  | "GET_CLASS_STATISTICS"
  | "GET_ASSESSMENT_HISTORY"
  | "CREATE_ASSESSMENT_PLAN"
  | "CREATE_STUDENT_CHANGE_PLAN"
  | "CREATE_DEACTIVATION_PLAN"
  | "CREATE_CLEAR_PLAN"
  | "CREATE_CONFIG_PLAN"
  | "CREATE_PUBLISH_PLAN"
  | "CREATE_IMPORT_PLAN"
  | "CLARIFY";
export type ToolCall = {
  name: ToolName;
  args: {
    aspects: string[];
    rombel: number;
    metric: "summary" | "average" | "minimum" | "maximum" | "distribution";
    status: "all" | "empty" | "partial" | "complete" | "draft";
  };
};
export type AIPlanTarget = {
  student: Pick<Student, "id" | "npm" | "name" | "rombel_id" | "study_case">;
  revision: number;
  versionId: string;
  config: Configuration;
  before: AssessmentData;
  after: AssessmentData;
  preview: Calculation;
};
export type AIPlan = {
  id: string;
  revision: number;
  hash: string;
  state: "awaiting_review" | "executed" | "cancelled" | "expired" | "conflicted";
  command: string;
  scopes: string[];
  targets: AIPlanTarget[];
  expiresAt: string;
  ready: boolean;
};
export type AIAdminPlan = {
  id: string;
  revision: number;
  hash: string;
  state: AIPlan["state"];
  command: string;
  expiresAt: string;
  ready: boolean;
  kind: "student" | "deactivate" | "clear" | "configuration" | "publish" | "import";
  student?: AIPlanTarget["student"];
  before: unknown;
  after: Record<string, any>;
  baseVersion?: string;
  baseRevision?: number;
};
export type AIStatistics = {
  total: number;
  complete: number;
  empty: number;
  partial: number;
  draft: number;
  percentage: number;
  count: number;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  aspect: string;
  missing: Record<string, number>;
  distribution: { label: string; count: number }[];
};
export type AIStudentResult = {
  student: AIPlanTarget["student"];
  result: Calculation;
  missing: string[];
  explanations: string[];
  submissions?: AssessmentData["submissions"];
  notes?: AssessmentData["scores"];
  version: number;
};
export type AIResponse = {
  requestId?: string;
  state?: AICommandState;
  kind: "result" | "clarification" | "plan";
  title: string;
  description: string;
  activities: string[];
  workspaceId: string;
  provider: ProviderName;
  students?: AIStudentResult[];
  candidates?: AIPlanTarget["student"][];
  statistics?: AIStatistics;
  rubric?: Configuration;
  history?: {
    component: string;
    before_value: unknown;
    after_value: unknown;
    reason: string;
    created_at: string;
  }[];
  plan?: AIPlan;
  adminPlan?: AIAdminPlan;
  comparison?: { rombel: number; statistics: AIStatistics }[];
  sourceTime: string;
};
