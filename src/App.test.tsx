import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MealForm } from './App';
import type { MealFormValues } from './lib/types';

const initialValues: MealFormValues = {
  name: '',
  description: '',
  recipe_url: '',
  notes: '',
  default_servings: 4,
  ingredients: [{ name: '', quantity: null, preparation_note: '', is_optional: false }],
};

describe('MealForm', () => {
  it('validates required meal details before saving', async () => {
    const onSave = vi.fn();
    render(<MealForm initialValues={initialValues} onSave={onSave} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /save meal/i }));

    expect(await screen.findByText('Meal name is required.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves a meal with multiple ingredients', async () => {
    const onSave = vi.fn();
    render(<MealForm initialValues={initialValues} onSave={onSave} onCancel={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Meal name'), 'Chicken bowls');
    await userEvent.type(screen.getByLabelText('Ingredient name'), 'Chicken');
    await userEvent.type(screen.getByLabelText('Quantity'), '2');
    await userEvent.click(screen.getByRole('button', { name: /add ingredient/i }));
    await userEvent.type(screen.getAllByLabelText('Ingredient name')[1], 'Rice');
    await userEvent.type(screen.getAllByLabelText('Quantity')[1], '1');
    await userEvent.click(screen.getByRole('button', { name: /save meal/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Chicken bowls',
      ingredients: expect.arrayContaining([
        expect.objectContaining({ name: 'Chicken', quantity: 2 }),
        expect.objectContaining({ name: 'Rice', quantity: 1 }),
      ]),
    }));
  });
});
