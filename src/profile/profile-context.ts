export type UserProfileLike = {
  role?: string;
  age?: number;
  occupation?: string;
  availableHoursPerDay?: number;
  availableSchedule?: Array<{ day: string; start: string; end: string }>;
  workHoursPerDay?: number;
  studyHoursPerDay?: number;
  energyMorning?: number;
  energyAfternoon?: number;
  energyNight?: number;
  preferredActivities?: string[];
  distractions?: string[];
  workMethod?: string;
  personalGoals?: string[];
  learningStyle?: string;
  workloadTolerance?: number;
  declaredFieldNames?: string[];
  averageMinutesByTaskType?: Record<string, number>;
  averageEstimationErrorMinutes?: number;
  onTimeCompletionRate?: number;
  averageActualMinutes?: number;
  actualWorkloadTolerance?: number;
  lastBehaviorObservedAt?: number;
};

/** Contexto estable para prompts: excluye IDs y metadatos internos de Convex. */
export function toProfileContext(profile: UserProfileLike | null | undefined): UserProfileLike | null {
  if (!profile) return null;

  return {
    role: profile.role,
    age: profile.age,
    occupation: profile.occupation,
    availableHoursPerDay: profile.availableHoursPerDay,
    availableSchedule: profile.availableSchedule,
    workHoursPerDay: profile.workHoursPerDay,
    studyHoursPerDay: profile.studyHoursPerDay,
    energyMorning: profile.energyMorning,
    energyAfternoon: profile.energyAfternoon,
    energyNight: profile.energyNight,
    preferredActivities: profile.preferredActivities,
    distractions: profile.distractions,
    workMethod: profile.workMethod,
    personalGoals: profile.personalGoals,
    learningStyle: profile.learningStyle,
    workloadTolerance: profile.workloadTolerance,
    declaredFieldNames: profile.declaredFieldNames,
    averageMinutesByTaskType: profile.averageMinutesByTaskType,
    averageEstimationErrorMinutes: profile.averageEstimationErrorMinutes,
    onTimeCompletionRate: profile.onTimeCompletionRate,
    averageActualMinutes: profile.averageActualMinutes,
    actualWorkloadTolerance: profile.actualWorkloadTolerance,
    lastBehaviorObservedAt: profile.lastBehaviorObservedAt,
  };
}
