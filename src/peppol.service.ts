import { Injectable } from '@angular/core';
import { COUNTRY_NAMES, EAS_CODES } from './app.constants';
import { FLAG, DEFAULTS, TEXT } from './app.config';

@Injectable({ providedIn: 'root' })
export class PeppolService {
  getCountryName(code: string): string {
    if (!code) return code;
    return COUNTRY_NAMES[code] || code;
  }

  getEasDescription(code: string): string {
    return EAS_CODES[code] || TEXT.UNKNOWN_REGISTER;
  }

  getFlagUrl(countryCode: string): string {
    if (!countryCode || countryCode === DEFAULTS.UNKNOWN) {
      return `${FLAG.BASE_URL}/xx.png`;
    }
    return `${FLAG.BASE_URL}/${countryCode.toLowerCase()}.png`;
  }

  parseParticipantId(participantId: string): { registerName: string, organizationId: string } {
    const parts = participantId?.split(':') || [];
    if (parts.length !== 2) {
      return { registerName: DEFAULTS.UNKNOWN, organizationId: participantId };
    }
    const registerId = parts[0];
    const organizationId = parts[1];
    const registerName = this.getEasDescription(registerId);
    return { registerName, organizationId };
  }
}
