import { TestBed } from '@angular/core/testing';

import { Todos } from './todos';

describe('Todos', () => {
  let service: Todos;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Todos);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
