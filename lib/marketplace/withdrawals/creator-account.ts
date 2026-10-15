import "server-only";
import { z } from "zod";
import { withdrawalAccountSchema, withdrawalFailureMessages } from "./contract";

// The private service-only RPC retains its historical internal projection.
// Strip diagnostics before initial rendering or any creator action response.
const storedAccount = withdrawalAccountSchema.extend({
  history: z.array(
    withdrawalAccountSchema.shape.history.element
      .omit({ failureMessage: true })
      .extend({ failureCode: z.string().nullable() }),
  ),
});

export function creatorWithdrawalAccount(input: unknown) {
  const account = storedAccount.parse(input);
  return withdrawalAccountSchema.parse({
    ...account,
    history: account.history.map(({ failureCode, ...withdrawal }) => ({
      ...withdrawal,
      failureMessage: withdrawal.status === "failed"
        ? withdrawalFailureMessages[failureCode === "REFUND_BELOW_MINIMUM" ? 0 : 1]
        : null,
    })),
  });
}
