import axios, { AxiosError } from "axios";

export type ScoreRecord = {
  player_name: string;
  score: number;
  phase: number;
};

export type SubmitScorePayload = ScoreRecord;

export type HealthResponse = {
  ok: boolean;
};

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const apiClient = axios.create({
  baseURL: "/api",
  timeout: 5000,
  headers: {
    "Content-Type": "application/json",
  },
});

function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      return new ApiError(
        `接口返回异常 (${axiosError.response.status})`,
        axiosError.response.status,
      );
    }
    if (axiosError.code === "ECONNABORTED") {
      return new ApiError("排行榜服务器响应超时");
    }
    return new ApiError("排行榜服务器暂时不可达");
  }
  return new ApiError("排行榜数据解析失败");
}

function normalizeScores(value: unknown): ScoreRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      player_name:
        typeof item?.player_name === "string" ? item.player_name : "匿名",
      score: Number.isFinite(Number(item?.score)) ? Number(item.score) : 0,
      phase: Number.isFinite(Number(item?.phase)) ? Number(item.phase) : 1,
    }))
    .filter((item) => item.score >= 0);
}

export async function getScores(): Promise<ScoreRecord[]> {
  try {
    const response = await apiClient.get<unknown>("/scores");
    return normalizeScores(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function submitScore(payload: SubmitScorePayload): Promise<void> {
  try {
    await apiClient.post("/scores", payload);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await apiClient.get<HealthResponse>("/health");
    return response.data?.ok === true;
  } catch {
    return false;
  }
}
