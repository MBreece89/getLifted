import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ApiService, Workout, WorkoutOptions } from './api.service';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;
  const apiBaseUrl = 'http://localhost:8080';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ApiService]
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getWorkout', () => {
    it('should call /workout endpoint without parameters', () => {
      const mockWorkout: Workout = {
        name: 'Push-Ups',
        bodyPart: 'chest',
        style: 'strength',
        sets: 3,
        reps: 12
      };

      service.getWorkout().subscribe(result => {
        expect(result).toEqual(mockWorkout);
      });

      const req = httpMock.expectOne(`${apiBaseUrl}/workout`);
      expect(req.request.method).toBe('GET');
      req.flush(mockWorkout);
    });

    it('should call /workout endpoint with type parameter', () => {
      const mockWorkout: Workout = {
        name: 'Burpees',
        bodyPart: 'full body',
        style: 'cardio'
      };

      service.getWorkout('cardio').subscribe(result => {
        expect(result).toEqual(mockWorkout);
      });

      const req = httpMock.expectOne(`${apiBaseUrl}/workout?type=cardio`);
      expect(req.request.params.get('type')).toBe('cardio');
      req.flush(mockWorkout);
    });

    it('should call /workout endpoint with type and bodyPart parameters', () => {
      const mockWorkout: Workout = {
        name: 'Jump Squats',
        bodyPart: 'legs',
        style: 'cardio'
      };

      service.getWorkout('cardio', 'legs').subscribe(result => {
        expect(result).toEqual(mockWorkout);
      });

      const req = httpMock.expectOne(
        `${apiBaseUrl}/workout?type=cardio&bodyPart=legs`
      );
      expect(req.request.params.get('type')).toBe('cardio');
      expect(req.request.params.get('bodyPart')).toBe('legs');
      req.flush(mockWorkout);
    });
  });

  describe('getPlan', () => {
    it('should call /workout/plan endpoint', () => {
      const mockPlan: Workout[] = [
        { name: 'Squats', bodyPart: 'legs', style: 'strength', sets: 3, reps: 10 },
        { name: 'Lunges', bodyPart: 'legs', style: 'strength', sets: 3, reps: 12 }
      ];

      service.getPlan('strength').subscribe(result => {
        expect(result).toEqual(mockPlan);
      });

      const req = httpMock.expectOne(`${apiBaseUrl}/workout/plan?type=strength`);
      expect(req.request.params.get('type')).toBe('strength');
      req.flush(mockPlan);
    });
  });

  describe('getOptions', () => {
    it('should call /workout/options endpoint', () => {
      const mockOptions: WorkoutOptions = {
        bodyParts: ['chest', 'legs', 'back', 'arms', 'shoulders', 'core', 'full body'],
        styles: ['strength', 'cardio', 'flexibility', 'balance']
      };

      service.getOptions().subscribe(result => {
        expect(result).toEqual(mockOptions);
      });

      const req = httpMock.expectOne(`${apiBaseUrl}/workout/options`);
      expect(req.request.method).toBe('GET');
      req.flush(mockOptions);
    });
  });

  describe('getCommands', () => {
    it('should call /commands endpoint', () => {
      const mockCommands = [
        { command: 'help', description: 'List available commands' },
        { command: 'get-workout', description: 'Retrieve a random workout' }
      ];

      service.getCommands().subscribe(result => {
        expect(result).toEqual(mockCommands);
      });

      const req = httpMock.expectOne(`${apiBaseUrl}/commands`);
      expect(req.request.method).toBe('GET');
      req.flush(mockCommands);
    });
  });

  describe('postLogs', () => {
    it('should post logs to /logs endpoint', () => {
      const logEvent = {
        timestamp: new Date().toISOString(),
        command: 'get-workout',
        params: { type: 'strength' },
        status: 200,
        latency: 42
      };

      service.postLogs(logEvent).subscribe();

      const req = httpMock.expectOne(`${apiBaseUrl}/logs`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(logEvent);
      req.flush({ accepted: true });
    });
  });
});
