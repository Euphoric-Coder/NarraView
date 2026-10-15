import { TemporalRagService } from './service';
import { TemporalRagRequest, TemporalRagResponse } from './types';

export interface RuntimeProvider {
  handle(request: TemporalRagRequest, options?: { allowPreActivationTest?: boolean }): Promise<TemporalRagResponse>;
}

export class GenericIntelligenceProvider implements RuntimeProvider {
  private service: TemporalRagService;

  constructor(service: TemporalRagService) {
    this.service = service;
  }

  async handle(request: TemporalRagRequest, options?: { allowPreActivationTest?: boolean }): Promise<TemporalRagResponse> {
    return this.service.processRequest(request, options);
  }
}
