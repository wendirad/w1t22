export interface Transition<S extends string, E extends string> {
  from: S | S[];
  event: E;
  to: S;
  guard?: (context: any) => boolean | Promise<boolean>;
}

export interface StateMachineDefinition<S extends string, E extends string> {
  initial: S;
  transitions: Transition<S, E>[];
}

export class StateMachine<S extends string, E extends string> {
  private definition: StateMachineDefinition<S, E>;
  private currentState: S;

  constructor(definition: StateMachineDefinition<S, E>, currentState?: S) {
    this.definition = definition;
    this.currentState = currentState || definition.initial;
  }

  getState(): S {
    return this.currentState;
  }

  can(event: E): boolean {
    return this.definition.transitions.some(
      (t) =>
        (Array.isArray(t.from) ? t.from.includes(this.currentState) : t.from === this.currentState) &&
        t.event === event
    );
  }

  getAvailableEvents(): E[] {
    return this.definition.transitions
      .filter((t) =>
        Array.isArray(t.from) ? t.from.includes(this.currentState) : t.from === this.currentState
      )
      .map((t) => t.event);
  }

  async transition(event: E, context?: any): Promise<{ from: S; to: S }> {
    const transition = this.definition.transitions.find(
      (t) =>
        (Array.isArray(t.from) ? t.from.includes(this.currentState) : t.from === this.currentState) &&
        t.event === event
    );

    if (!transition) {
      throw new Error(
        `Invalid transition: cannot apply event "${event}" in state "${this.currentState}"`
      );
    }

    if (transition.guard) {
      const allowed = await transition.guard(context);
      if (!allowed) {
        throw new Error(
          `Guard rejected transition: "${event}" from "${this.currentState}"`
        );
      }
    }

    const from = this.currentState;
    this.currentState = transition.to;
    return { from, to: transition.to };
  }
}
