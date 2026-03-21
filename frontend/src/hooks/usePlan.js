export function usePlan() {
  const plan = localStorage.getItem('washflow_plan') ?? 'none';
  const role = localStorage.getItem('washflow_role');
  const isSuper = role === 'superadmin' || plan === 'superadmin';
  
  const effectivePlan = isSuper ? 'superadmin' : plan;
  const isPremium     = isSuper || effectivePlan === 'premium';

  return {
    plan: effectivePlan,
    isPremium,
    isActive:  effectivePlan !== 'none',
    isBasic:   effectivePlan === 'basic',
    isNone:    effectivePlan === 'none' && !isSuper,
    isSuper,
  };
}
