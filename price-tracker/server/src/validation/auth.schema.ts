import { z } from 'zod';

export const unlockSchema = z.object({
  // Deliberately not held to the password policy: it is checked against one
  // configured value, not stored, so complexity rules would only reject
  // passwords the operator has already chosen.
  password: z.string().min(1, 'Enter the access password').max(200),
});

export type UnlockInput = z.infer<typeof unlockSchema>;
