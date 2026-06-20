import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LoggingService } from './logging.service';

describe('LoggingService', () => {
  let service: LoggingService;
  let httpMock: HttpTestingController;
  const apiBaseUrl = 'http://localhost:8080';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [LoggingService]
    });
    service = TestBed.inject(LoggingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('logCommand', () => {
    it('should post log event to /logs endpoint', () => {
      const response = { name: 'Push-Ups', bodyPart: 'chest' };

      service.logCommand('get-workout --type strength', { type: 'strength' }, response, 200, 42);

      const req = httpMock.expectOne(`${apiBaseUrl}/logs`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.command).toBe('get-workout --type strength');
      expect(req.request.body.status).toBe(200);
      expect(req.request.body.latency).toBe(42);
      req.flush({ accepted: true });
    });

    it('should sanitize sensitive parameters', () => {
      service.logCommand('login', { password: 'secret123' }, {}, 200, 10);

      const req = httpMock.expectOne(`${apiBaseUrl}/logs`);
      expect(req.request.body.params.password).toBe('[REDACTED]');
      req.flush({});
    });

    it('should sanitize sensitive response fields', () => {
      const response = { token: 'secret-token-123', name: 'User' };

      service.logCommand('get-user', {}, response, 200, 15);

      const req = httpMock.expectOne(`${apiBaseUrl}/logs`);
      expect(req.request.body.response.token).toBe('[REDACTED]');
      expect(req.request.body.response.name).toBe('User');
      req.flush({});
    });

    it('should handle error from /logs endpoint gracefully', () => {
      spyOn(console, 'log');

      service.logCommand('get-workout', {}, {}, 200, 10);

      const req = httpMock.expectOne(`${apiBaseUrl}/logs`);
      req.error(new ProgressEvent('error'));

      // Should not throw, just silently fail or log to console
      expect(true).toBe(true); // Verify no exception thrown
    });

    it('should include timestamp in log event', (done) => {
      const beforeTime = new Date();

      service.logCommand('help', {}, [], 200, 5);

      const req = httpMock.expectOne(`${apiBaseUrl}/logs`);
      const timestamp = new Date(req.request.body.timestamp);
      const afterTime = new Date();

      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
      req.flush({});
      done();
    });

    it('should handle nested sensitive fields in response', () => {
      const response = {
        user: {
          name: 'John',
          apiKey: 'secret-key'
        },
        token: 'bearer-token'
      };

      service.logCommand('get-user', {}, response, 200, 20);

      const req = httpMock.expectOne(`${apiBaseUrl}/logs`);
      expect(req.request.body.response.user.apiKey).toBe('[REDACTED]');
      expect(req.request.body.response.token).toBe('[REDACTED]');
      expect(req.request.body.response.user.name).toBe('John');
      req.flush({});
    });
  });

  describe('logEvent', () => {
    it('should post to /logs with eventType field when logEvent is called', () => {
      const payload = { message: 'app started' };

      service.logEvent('APP_INIT', payload);

      const req = httpMock.expectOne(`${apiBaseUrl}/logs`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.eventType).toBe('APP_INIT');
      req.flush({});
    });
  });

  describe('sanitization mixed case', () => {
    it('should redact apiKey in params', () => {
      service.logCommand('cmd', { apiKey: 'secret' }, {}, 200, 5);

      const req = httpMock.expectOne(`${apiBaseUrl}/logs`);
      expect(req.request.body.params.apiKey).toBe('[REDACTED]');
      req.flush({});
    });

    it('should redact ApiKey in params', () => {
      service.logCommand('cmd', { ApiKey: 'secret' }, {}, 200, 5);

      const req = httpMock.expectOne(`${apiBaseUrl}/logs`);
      expect(req.request.body.params.ApiKey).toBe('[REDACTED]');
      req.flush({});
    });

    it('should redact APIKEY in params', () => {
      service.logCommand('cmd', { APIKEY: 'secret' }, {}, 200, 5);

      const req = httpMock.expectOne(`${apiBaseUrl}/logs`);
      expect(req.request.body.params.APIKEY).toBe('[REDACTED]');
      req.flush({});
    });
  });
});
