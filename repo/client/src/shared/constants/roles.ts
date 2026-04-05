export enum Role {
  BUYER = 'buyer',
  DEALERSHIP_STAFF = 'dealership_staff',
  FINANCE_REVIEWER = 'finance_reviewer',
  ADMIN = 'admin',
}

export const ROLE_LABELS: Record<string, string> = {
  [Role.BUYER]: 'Buyer',
  [Role.DEALERSHIP_STAFF]: 'Staff',
  [Role.FINANCE_REVIEWER]: 'Finance',
  [Role.ADMIN]: 'Admin',
};

export const ROLE_COLORS: Record<string, string> = {
  [Role.BUYER]: 'bg-blue-100 text-blue-800',
  [Role.DEALERSHIP_STAFF]: 'bg-green-100 text-green-800',
  [Role.FINANCE_REVIEWER]: 'bg-purple-100 text-purple-800',
  [Role.ADMIN]: 'bg-red-100 text-red-800',
};
