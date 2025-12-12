import * as z from 'zod';

export const ImageConfigSchema = z
  .object({
    format: z.enum(['PNG', 'JPEG']).default('JPEG'),
    quality: z.int().min(1).max(100).default(85),
    width: z.int().positive().nullish().default(1260),
    height: z.int().positive().nullish().default(700),
    optimize: z.boolean().default(false),
    resample: z.enum(['NEAREST', 'BILINEAR', 'BICUBIC', 'LANCZOS']).default('LANCZOS'),
  })
  .transform((value) => {
    if (value.format === 'PNG') {
      return { ...value, quality: 85 };
    }
    return value;
  });

export type ImageConfig = z.infer<typeof ImageConfigSchema>;
