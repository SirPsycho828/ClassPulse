import { describe, it, expect } from 'vitest';
import { generateDisplayNames } from '../src/components/ClassForm';

describe('generateDisplayNames', () => {
  it('returns first name + last initial for unique names', () => {
    const students = [
      { firstName: 'Emma', lastName: 'Johnson' },
      { firstName: 'Marcus', lastName: 'Rivera' },
    ];
    const result = generateDisplayNames(students);
    expect(result).toEqual(['Emma J.', 'Marcus R.']);
  });

  it('returns first name only when no last name', () => {
    const students = [{ firstName: 'Cher', lastName: '' }];
    const result = generateDisplayNames(students);
    expect(result).toEqual(['Cher']);
  });

  it('extends last name prefix to disambiguate collisions', () => {
    const students = [
      { firstName: 'Alex', lastName: 'Johnson' },
      { firstName: 'Alex', lastName: 'Jones' },
    ];
    const result = generateDisplayNames(students);
    // "Jo" is the same, so it needs "Joh" vs "Jon"
    expect(result).toEqual(['Alex Joh.', 'Alex Jon.']);
  });

  it('handles empty input', () => {
    expect(generateDisplayNames([])).toEqual([]);
  });
});
