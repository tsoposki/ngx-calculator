import {Component, OnDestroy} from '@angular/core';
import {Observable} from 'rxjs/Rx';
import {BehaviorSubject} from 'rxjs/BehaviorSubject';
import {Subscription} from 'rxjs/Subscription';
import {eval as mathEval} from 'mathjs';

type Operator = '*' | '-' | '+' | '/' | '=';

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.component.html',
  styleUrls: ['./calculator.component.scss']
})
export class CalculatorComponent implements OnDestroy {
  result$: Observable<string>;
  resultSubj = new BehaviorSubject<string>('');
  inputSubj = new BehaviorSubject<string>('0');
  private _subs: Array<Subscription> = [];
  private _captureKey$: Observable<string> = createCaptureKey$(document).publishReplay(1).refCount();

  constructor() {
    this._subs.push(
      this._createExpression$().subscribe(),
      this._deleteInputOnTriggers().subscribe()
    );
    this.result$ = this.resultSubj.asObservable().map(expressionToInputString);
  }

  ngOnDestroy() {
    this._subs.forEach(sub => sub.unsubscribe());
  }

  private _deleteInputOnTriggers = (): Observable<any> =>
    this._captureKey$
      .filter(key => (key === 'Backspace' || key === 'Delete') && this.resultSubj.value.length > 0)
      .do(() => this.resultSubj.next(this.resultSubj.value.slice(0, this.resultSubj.value.length - 1)))

  private _createExpression$ = (): Observable<string> =>
    this._updateExpressionOnTriggers()
      .do(val => this.resultSubj.next(val))
      .distinctUntilChanged()

  private _updateExpressionOnTriggers = (): Observable<string> =>
    Observable.merge(
      this._captureNumbersOnTriggers()
        .withLatestFrom(this.resultSubj)
        .map(([newNumber, result]) => {
          const lastNumberFromExpression = pluckLastNumberFromExpression(result);
          return lastInputIsOperator(result) ?
            result + newNumber :
            result.replace(lastNumberPattern, '') + parseFloat((lastNumberFromExpression || '') + newNumber.toString());
        }),
      this._captureOperatorsOnTriggers$()
        .withLatestFrom(this.resultSubj)
        .map(([newOperator, result]) => {
          if (newOperator === '=') {
            try {
              const evaluatedResult = mathEval(result);
              return Number.isInteger(evaluatedResult) ? evaluatedResult.toString() : evaluatedResult.toFixed(4);
            } catch (err) {
              return result;
            }
          } else {
            return updateLatestOperator(result, newOperator);
          }
        })
    )

  private _captureNumbersOnTriggers = (): Observable<string> =>
    Observable.merge(
      this._captureKey$,
      this.inputSubj
    )
      .map(key => parseInt(key, 10))
      .filter(isNumber)

  private _captureOperatorsOnTriggers$ = (): Observable<Operator> =>
    <Observable<Operator>>Observable.merge(
      this._captureKey$.map(key => key === 'Enter' ? '=' : key),
      this.inputSubj
    ).filter(isOperator)
}

function createCaptureKey$(element: any): Observable<string> {
  return Observable.fromEvent(element, 'keydown').map((e: KeyboardEvent) => e.key);
}

function isOperator(str: string): boolean {
  switch (str) {
    case '*':
    case '-':
    case '+':
    case '/':
    case '=':
      return true;
    default:
      return false;
  }
}

function isNumber(obj: any): boolean {
  return typeof obj === 'number' && !Number.isNaN(obj);
}

function lastInputIsOperator(expression: string): boolean {
  return isOperator(expression.substr(expression.length - 1));
}

function updateLatestOperator(expression: string, newOperator: Operator): string {
  return (
    lastInputIsOperator(expression) ?
      expression.substr(0, expression.length - 1) + newOperator :
      expression + newOperator
  );
}

function pluckLastNumberFromExpression(expression: string): number {
  const res = expression.match(lastNumberPattern);
  return (
    !!res ?
      parseFloat(res[1]) :
      null
  );
}

function expressionToInputString(expression: string): string {
  let input = expression.replace('*', '&times;');
  input = input.replace('/', '&divide;');
  return input;
}

const lastNumberPattern = /(\d+)(?!.*\d)/;
