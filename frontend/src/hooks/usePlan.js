export function usePlan() {
  const plan = localStorage.getItem('washflow_plan') ?? 'none';
  const role = localStorage.getItem('washflow_role');
  const isSuper = role === 'superadmin' || plan === 'superadmin';
  
  // Si es superadmin y el plan actual es 'superadmin' (valor inicial),
  // le damos acceso premium por defecto.
  // Si seleccionó manualmente 'basic' o 'premium', respetamos eso para validación.
  const effectivePlan = (isSuper && plan === 'superadmin') ? 'premium' : plan;

  return {
    plan: effectivePlan,
    isPremium: effectivePlan === 'premium',
    isActive:  effectivePlan !== 'none',
    isBasic:   effectivePlan === 'basic',
    isNone:    effectivePlan === 'none',
    isSuper,
  };
}
