import { Cart } from '../models/cart.model';
import { Vehicle } from '../models/vehicle.model';
import { VehicleStatus } from '../types/enums';
import { NotFoundError, BadRequestError } from '../lib/errors';

const AVAILABLE_ADDONS = [
  { serviceCode: 'inspection', name: 'Inspection Package', price: 29900 },
  { serviceCode: 'extended_warranty', name: 'Extended Warranty', price: 149900 },
];

export function getAvailableAddOns() {
  return AVAILABLE_ADDONS;
}

export async function getCart(userId: string, dealershipId: string) {
  let cart = await Cart.findOne({ userId, dealershipId }).populate('items.vehicleId');
  if (!cart) {
    cart = new Cart({ userId, dealershipId, items: [] });
    await cart.save();
  }
  return cart;
}

export async function addToCart(
  userId: string,
  dealershipId: string,
  vehicleId: string,
  addOnServices: Array<{ serviceCode: string }> = []
) {
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) throw new NotFoundError('Vehicle not found');
  if (vehicle.status !== VehicleStatus.AVAILABLE) {
    throw new BadRequestError('Vehicle is not available');
  }

  let cart = await Cart.findOne({ userId, dealershipId });
  if (!cart) {
    cart = new Cart({ userId, dealershipId, items: [] });
  }

  const alreadyInCart = cart.items.some(
    (item) => item.vehicleId.toString() === vehicleId
  );
  if (alreadyInCart) {
    throw new BadRequestError('Vehicle already in cart');
  }

  const addOns = addOnServices
    .map((a) => AVAILABLE_ADDONS.find((ao) => ao.serviceCode === a.serviceCode))
    .filter(Boolean) as typeof AVAILABLE_ADDONS;

  cart.items.push({
    vehicleId: vehicle._id as any,
    addOnServices: addOns,
    addedAt: new Date(),
  });

  await cart.save();
  return Cart.findById(cart._id).populate('items.vehicleId');
}

export async function removeFromCart(
  userId: string,
  dealershipId: string,
  vehicleId: string
) {
  const cart = await Cart.findOne({ userId, dealershipId });
  if (!cart) throw new NotFoundError('Cart not found');

  cart.items = cart.items.filter(
    (item) => item.vehicleId.toString() !== vehicleId
  );

  await cart.save();
  return Cart.findById(cart._id).populate('items.vehicleId');
}

export async function clearCart(userId: string, dealershipId: string) {
  await Cart.findOneAndUpdate({ userId, dealershipId }, { items: [] });
}
