import { Component } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import solver from 'javascript-lp-solver';
import * as meals_dinner from '../assets/meals_dinner.json';
import * as meals_breakfast from '../assets/meals_breakfast.json';
import * as meals_lunch from '../assets/meals_lunch.json';

interface Product {
    name: string;
    protein: number;
    carbs: number;
    fat: number;
    kcal: number;
    cost: number;
    isVegan: boolean;
    isLactoseFree: boolean;
    isGlutenFree: boolean;
}

export type UserProfile = {
    weight: number; // in kg
    height: number; // in cm
    age: number; // in years
    sex: 'm' | 'f';
    activityLevel: 'low' | 'moderate' | 'high';
    target: 'loose' | 'gain' | 'maintain';
    wealthLevel: 'student' | 'average' | 'elon_musk';
    preferences: {
        meatless: boolean;
        lactoseFree: boolean;
        glutenFree: boolean;
    };
}

export type Composition = {
    protein: { min?: number; max?: number; equal?: number };
    carbs: { min?: number; max?: number; equal?: number };
    fat: { min?: number; max?: number; equal?: number };
};

@Component({
    selector: 'app-root',
    imports: [FormsModule, ReactiveFormsModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    standalone: true,
})
export class AppComponent {

    userProfileForm: FormGroup;
    result: any;
    result2: any;

    constructor(private fb: FormBuilder) {
        this.userProfileForm = this.fb.group({
            weight: ['68', Validators.required],
            height: ['172', Validators.required],
            age: ['25', Validators.required],
            sex: ['m', Validators.required],
            activityLevel: ['low', Validators.required],
            target: ['loose', Validators.required],
            wealthLevel: ['student', Validators.required],
            preferences: this.fb.group({
                meatless: [true],
                lactoseFree: [false],
                glutenFree: [false]
            })
        });
    }

    meals: { [key: string]: any } = convertMeals({
        ...meals_breakfast,
        ...meals_dinner,
        ...meals_lunch
    });

    ints = {
        ...convertToSimpleObject(this.meals)
    }

    model?: {
        optimize: string;
        opType: string;
        constraints: {
            cost: { max: number };
            kcal: { equal?: number; max?: number; min?: number };
        };
        variables: any;
        ints: any;
    };

    onSubmit(): void {

        const userProfile = this.userProfileForm.value;

        const preferenceVariables = this.filterProductsByPreferences(this.meals, userProfile.preferences);

        const targetCalories = this.calculateCalories(userProfile);
        const targetCost = this.calculateCost(userProfile.wealthLevel);
        const mealTypeConstraints = this.createMealTypeConstraints();

        const constraintsNoCost = {
            ...convertToConstraintsObject(this.ints),
            kcal: targetCalories,
            ...mealTypeConstraints
        };
        const constraints = {
            ...constraintsNoCost,
            cost: targetCost
        };

        this.model = {
            optimize: "cost",
            opType: "min",
            constraints,
            variables: preferenceVariables,
            ints: this.ints,
        };

        this.result = solver.Solve(this.model);
        this.result2 = solver.Solve({
            ...this.model,
            opType: "min",
            optimize: "kcal_diff",
            constraints: constraintsNoCost
        })
    }

    getDietPlanByDays(result: any) {
        const { feasible } = result;
        delete result.feasible;
        delete result.result;
        delete result.bounded;
        delete result.isIntegral;

        const breakfasts = [];
        const dinners = [];
        const lunches = [];
        for (const mealId in result) {
            if (this.meals[mealId]) {
                if (this.meals[mealId].breakfast === 1) {
                    breakfasts.push(this.meals[mealId]);
                } else if (this.meals[mealId].lunch === 1) {
                    lunches.push(this.meals[mealId]);
                } else if (this.meals[mealId].dinner === 1) {
                    dinners.push(this.meals[mealId]);
                }
            }
        }

        breakfasts.sort((a: Product, b: Product) => a.kcal - b.kcal);
        dinners.sort((a: Product, b: Product) => a.kcal - b.kcal);
        lunches.sort((a: Product, b: Product) => a.kcal - b.kcal);

        const days = [];
        for (let i = 0; i < 7; i++) {
            const lunch = lunches[i];
            const dinner = dinners[dinners.length-1 - i];
            days.push({
                breakfast: breakfasts[i],
                lunch,
                dinner,
                total: {
                    protein: Math.floor(breakfasts[i].protein + lunch.protein + dinner.protein),
                    carbs: Math.floor(breakfasts[i].carbs + lunch.carbs + dinner.carbs),
                    fat: Math.floor(breakfasts[i].fat + lunch.fat + dinner.fat),
                    kcal: Math.floor(breakfasts[i].kcal + lunch.kcal + dinner.kcal),
                    cost: Math.floor((breakfasts[i].cost + lunch.cost + dinner.cost) * 2),
                },
            });
        }

        return days;
    }

    private calculateCalories(userProfile: UserProfile): { equal?: number, max?: number, min?: number } {
        // Mifflin-St Jeor Equation
        const bmr = userProfile.sex === 'm'
            ? 10 * userProfile.weight + 6.25 * userProfile.height - 5 * userProfile.age + 5
            : 10 * userProfile.weight + 6.25 * userProfile.height - 5 * userProfile.age - 161;
        const activityAdjustment = userProfile.activityLevel === 'low' ? 150 : userProfile.activityLevel === 'moderate' ? 300 : 450;
        const maintenanceCalories = Math.ceil((bmr + activityAdjustment) / 10) * 10;

        if (userProfile.target === 'loose') {
            const min = (maintenanceCalories - 500) * 7;
            return { min, max: min + 1000}; //deficit
        } else if (userProfile.target === 'gain') {
            const min = (maintenanceCalories + 500) * 7;
            return { min: (maintenanceCalories + 500) * 7, max: min + 1000}; //surplus
        } else {
            return { min: maintenanceCalories * 7 }; //maintain
        }
    }

    private calculateCost(wealthLevel: "student" | "average" | "elon_musk"): { max: number } {
        return {
            max: wealthLevel === 'student' ? 300
                : wealthLevel === 'average'
                    ? 500 : 2000
        };
    }

    // @ts-ignore
    private filterProductsByPreferences(variables: typeof variables, userPreferences: UserProfile['preferences']): typeof variables {
        return Object.fromEntries(
            Object.entries(variables).filter(([_, product]) => {
                const p = product as Product;
                return (!userPreferences.lactoseFree || p.isLactoseFree) &&
                    (!userPreferences.glutenFree || p.isGlutenFree) &&
                    (!userPreferences.meatless || p.isVegan);
            })
        );
    }

    private createMealTypeConstraints(): { [key: string]: { min?: number; max?: number } } {
        return {
            breakfast: { min: 7, max: 7 },
            lunch: { min: 7, max: 7 },
            dinner: { min: 7, max: 7 }
        };
    }
}

function convertToSimpleObject(original: { hasOwnProperty: (arg0: string) => any; }) {
    const result = {};
    for (const key in original) {
        if (original.hasOwnProperty(key) && key !== 'default') {
            // @ts-ignore
            result[key] = 1;
        }
    }
    return result;
}

function convertToConstraintsObject(original: { hasOwnProperty: (arg0: string) => any; }) {
    const result = {};
    for (const key in original) {
        if (original.hasOwnProperty(key) && key !== 'default') {
            // @ts-ignore
            result[key] = { max: 1 };
        }
    }
    return result;
}

function convertMeals(original: any) {
    const result = {};
    let index = 0;
    for (const key in original) {
        if (original.hasOwnProperty(key) && key !== 'default') {
            // @ts-ignore
            result[index] = {
                ...original[key],
                [index]: 1,
                name: key
            };
        }
        index++;
    }
    return result;
}


