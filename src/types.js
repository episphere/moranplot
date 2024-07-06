import z from 'https://cdn.jsdelivr.net/npm/zod@3.23.5/+esm'

export const Density = z.array(z.tuple([z.number(), z.number()]))
export const Neighbor = z.tuple([z.string(), z.number()])

export const Result = z.object({
  z: z.number(),
  lag: z.number(),
  statistic: z.number(),
  lowerCutoff: z.number().optional(),
  upperCutoff: z.number().optional(),
  permutationDistribution: Density.optional(),
  neighborWeights: z.array(Neighbor)
})
export const ResultCutoff = Result.extend({
  lowerCutoff: z.number(),
  upperCutoff: z.number(),
})
export const ResultDistribution = Result.extend({
  permutationDistribution: Density 
})
