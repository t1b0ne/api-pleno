import { Test, TestingModule } from '@nestjs/testing';
import { ClassroomService } from './classroom.service';
import { ConvexService } from '../convex/convex.service';

describe('ClassroomService', () => {
  let service: ClassroomService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassroomService,
        { provide: ConvexService, useValue: { getClient: jest.fn() } },
      ],
    }).compile();

    service = module.get<ClassroomService>(ClassroomService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
