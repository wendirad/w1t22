import { User } from '../models/user.model';
import { Dealership } from '../models/dealership.model';
import { Vehicle } from '../models/vehicle.model';
import { Synonym } from '../models/synonym.model';
import { TaxRate } from '../models/tax-rate.model';
import { Role, VehicleStatus } from '../types/enums';
import config from '../config';
import logger from '../lib/logger';

export async function runSeeds(): Promise<void> {
  const userCount = await User.countDocuments();
  if (userCount > 0) {
    logger.info('Database already seeded, skipping');
    return;
  }

  if (!config.seed.adminEmail || !config.seed.adminPassword) {
    logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set, skipping user seed');
    return;
  }

  logger.info('Seeding database...');

  const dealership = await Dealership.create({
    name: 'Metro Auto Group',
    region: 'Southeast',
    address: {
      street: '123 Main Street',
      city: 'Atlanta',
      state: 'Georgia',
      county: 'Fulton',
      zip: '30301',
    },
  });

  const dealership2 = await Dealership.create({
    name: 'Sunshine Motors',
    region: 'Southeast',
    address: {
      street: '456 Elm Avenue',
      city: 'Tampa',
      state: 'Florida',
      county: 'Hillsborough',
      zip: '33601',
    },
  });

  const admin = await User.create({
    email: config.seed.adminEmail,
    passwordHash: config.seed.adminPassword,
    role: Role.ADMIN,
    dealershipId: null,
    profile: { firstName: config.seed.adminFirstName, lastName: config.seed.adminLastName },
  });

  let usersCreated = 1;

  if (config.seed.staffEmail && config.seed.staffPassword) {
    await User.create({
      email: config.seed.staffEmail,
      passwordHash: config.seed.staffPassword,
      role: Role.DEALERSHIP_STAFF,
      dealershipId: dealership._id,
      profile: { firstName: config.seed.staffFirstName, lastName: config.seed.staffLastName },
    });
    usersCreated++;
  }

  if (config.seed.financeEmail && config.seed.financePassword) {
    await User.create({
      email: config.seed.financeEmail,
      passwordHash: config.seed.financePassword,
      role: Role.FINANCE_REVIEWER,
      dealershipId: dealership._id,
      profile: { firstName: config.seed.financeFirstName, lastName: config.seed.financeLastName },
    });
    usersCreated++;
  }

  if (config.seed.buyerEmail && config.seed.buyerPassword) {
    await User.create({
      email: config.seed.buyerEmail,
      passwordHash: config.seed.buyerPassword,
      role: Role.BUYER,
      dealershipId: dealership._id,
      profile: { firstName: config.seed.buyerFirstName, lastName: config.seed.buyerLastName },
    });
    usersCreated++;
  }

  const vehicles = await Vehicle.insertMany([
    {
      dealershipId: dealership._id,
      vin: '1HGCM82633A123456',
      make: 'Honda',
      model: 'Accord',
      year: 2023,
      trim: 'EX-L',
      mileage: 15000,
      price: 2899900,
      region: 'Southeast',
      registrationDate: new Date('2023-01-15'),
      supplierId: 'supplier-1',
      warehouseId: 'warehouse-A',
      estimatedTurnaround: 1,
      description: 'Well-maintained sedan with leather interior',
    },
    {
      dealershipId: dealership._id,
      vin: '1FTFW1ET3DFC10001',
      make: 'Ford',
      model: 'F-150',
      year: 2022,
      trim: 'XLT',
      mileage: 28000,
      price: 3599900,
      region: 'Southeast',
      registrationDate: new Date('2022-06-20'),
      supplierId: 'supplier-1',
      warehouseId: 'warehouse-A',
      estimatedTurnaround: 3,
      description: 'Popular full-size truck, great for work and play',
    },
    {
      dealershipId: dealership._id,
      vin: '1G1YY22G965104567',
      make: 'Chevrolet',
      model: 'Corvette',
      year: 2024,
      trim: 'Stingray',
      mileage: 5000,
      price: 6299900,
      region: 'Southeast',
      registrationDate: new Date('2024-03-10'),
      supplierId: 'supplier-2',
      warehouseId: 'warehouse-B',
      estimatedTurnaround: 5,
      description: 'Iconic American sports car with V8 engine',
    },
    {
      dealershipId: dealership._id,
      vin: '5YJSA1DG9DFP14567',
      make: 'Toyota',
      model: 'Camry',
      year: 2023,
      trim: 'SE',
      mileage: 20000,
      price: 2499900,
      region: 'Southeast',
      registrationDate: new Date('2023-04-05'),
      supplierId: 'supplier-1',
      warehouseId: 'warehouse-A',
      estimatedTurnaround: 1,
      description: 'Reliable midsize sedan, excellent fuel economy',
    },
    {
      dealershipId: dealership._id,
      vin: 'WAUEFAFL5CN012345',
      make: 'BMW',
      model: '3 Series',
      year: 2023,
      trim: '330i',
      mileage: 12000,
      price: 4199900,
      region: 'Southeast',
      registrationDate: new Date('2023-02-28'),
      supplierId: 'supplier-2',
      warehouseId: 'warehouse-B',
      estimatedTurnaround: 3,
      description: 'Luxury sport sedan with premium features',
    },
    {
      dealershipId: dealership._id,
      vin: '1N4BL4BV4LC234567',
      make: 'Nissan',
      model: 'Altima',
      year: 2022,
      trim: 'SV',
      mileage: 35000,
      price: 2199900,
      region: 'Southeast',
      registrationDate: new Date('2022-08-15'),
      supplierId: 'supplier-1',
      warehouseId: 'warehouse-A',
      estimatedTurnaround: 1,
      description: 'Comfortable sedan with advanced safety features',
    },
    {
      dealershipId: dealership2._id,
      vin: '2T1BURHE5JC123456',
      make: 'Toyota',
      model: 'Corolla',
      year: 2024,
      trim: 'LE',
      mileage: 8000,
      price: 2299900,
      region: 'Southeast',
      registrationDate: new Date('2024-01-10'),
      supplierId: 'supplier-3',
      warehouseId: 'warehouse-C',
      estimatedTurnaround: 2,
      description: 'Compact sedan, best-selling car worldwide',
    },
    {
      dealershipId: dealership2._id,
      vin: '3GNKBKRS0MS567890',
      make: 'Chevrolet',
      model: 'Equinox',
      year: 2023,
      trim: 'LT',
      mileage: 18000,
      price: 2899900,
      region: 'Southeast',
      registrationDate: new Date('2023-05-20'),
      supplierId: 'supplier-3',
      warehouseId: 'warehouse-C',
      estimatedTurnaround: 3,
      description: 'Versatile compact SUV with spacious interior',
    },
  ]);

  await Synonym.insertMany([
    { canonical: 'Chevrolet', aliases: ['Chevy', 'Chev'], field: 'make' },
    { canonical: 'BMW', aliases: ['Bimmer', 'Beemer'], field: 'make' },
    { canonical: 'Mercedes-Benz', aliases: ['Mercedes', 'Merc', 'Benz'], field: 'make' },
    { canonical: 'Volkswagen', aliases: ['VW', 'Volks'], field: 'make' },
    { canonical: 'F-150', aliases: ['F150', 'F 150'], field: 'model' },
    { canonical: 'Corvette', aliases: ['Vette', 'C8'], field: 'model' },
    { canonical: '3 Series', aliases: ['3-Series', '3Series', '330i', '340i'], field: 'model' },
  ]);

  await TaxRate.insertMany([
    { state: 'Georgia', county: 'Fulton', rate: 0.089, effectiveDate: new Date('2024-01-01') },
    { state: 'Georgia', county: '', rate: 0.04, effectiveDate: new Date('2024-01-01') },
    { state: 'Florida', county: 'Hillsborough', rate: 0.075, effectiveDate: new Date('2024-01-01') },
    { state: 'Florida', county: '', rate: 0.06, effectiveDate: new Date('2024-01-01') },
    { state: 'Texas', county: '', rate: 0.0625, effectiveDate: new Date('2024-01-01') },
    { state: 'California', county: '', rate: 0.0725, effectiveDate: new Date('2024-01-01') },
  ]);

  logger.info(
    {
      dealerships: 2,
      users: usersCreated,
      vehicles: vehicles.length,
      synonyms: 7,
      taxRates: 6,
    },
    'Database seeded successfully'
  );
}
