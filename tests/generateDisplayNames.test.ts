import { describe, it, expect } from 'vitest';
import { generateDisplayNames } from '../src/components/ClassForm';

describe('generateDisplayNames', () => {
  it('returns full first and last name', () => {
    const students = [
      { firstName: 'Emma', lastName: 'Johnson' },
      { firstName: 'Marcus', lastName: 'Rivera' },
    ];
    const result = generateDisplayNames(students);
    expect(result).toEqual(['Emma Johnson', 'Marcus Rivera']);
  });

  it('returns first name only when no last name', () => {
    const students = [{ firstName: 'Cher', lastName: '' }];
    const result = generateDisplayNames(students);
    expect(result).toEqual(['Cher']);
  });

  it('keeps full last name even with same first names', () => {
    const students = [
      { firstName: 'Alex', lastName: 'Johnson' },
      { firstName: 'Alex', lastName: 'Jones' },
    ];
    const result = generateDisplayNames(students);
    expect(result).toEqual(['Alex Johnson', 'Alex Jones']);
  });

  it('handles empty input', () => {
    expect(generateDisplayNames([])).toEqual([]);
  });
});
