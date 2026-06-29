// Tipo padrao de retorno das Server Actions.
// Toda action devolve sucesso/erro de forma previsivel p/ a UI tratar.
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}
