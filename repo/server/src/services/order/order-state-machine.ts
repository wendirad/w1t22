import { StateMachine, StateMachineDefinition } from '../../lib/state-machine';
import { OrderStatus, OrderEvent } from '../../types/enums';

export const orderStateMachineDefinition: StateMachineDefinition<OrderStatus, OrderEvent> = {
  initial: OrderStatus.CREATED,
  transitions: [
    { from: OrderStatus.CREATED, event: OrderEvent.RESERVE, to: OrderStatus.RESERVED },
    { from: OrderStatus.CREATED, event: OrderEvent.CANCEL, to: OrderStatus.CANCELLED },
    { from: OrderStatus.RESERVED, event: OrderEvent.INVOICE, to: OrderStatus.INVOICED },
    { from: OrderStatus.RESERVED, event: OrderEvent.CANCEL, to: OrderStatus.CANCELLED },
    { from: OrderStatus.INVOICED, event: OrderEvent.SETTLE, to: OrderStatus.SETTLED },
    { from: OrderStatus.INVOICED, event: OrderEvent.CANCEL, to: OrderStatus.CANCELLED },
    { from: OrderStatus.SETTLED, event: OrderEvent.FULFILL, to: OrderStatus.FULFILLED },
    { from: OrderStatus.SETTLED, event: OrderEvent.CANCEL, to: OrderStatus.CANCELLED },
  ],
};

export function createOrderStateMachine(currentStatus?: OrderStatus): StateMachine<OrderStatus, OrderEvent> {
  return new StateMachine(orderStateMachineDefinition, currentStatus);
}
