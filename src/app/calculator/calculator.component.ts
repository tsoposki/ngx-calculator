import {ChangeDetectionStrategy, Component, ElementRef, HostBinding, OnDestroy} from '@angular/core';
import {Observable} from 'rxjs/Rx';
import {BehaviorSubject} from 'rxjs/BehaviorSubject';
import {Subscription} from 'rxjs/Subscription';
import {eval as mathEval} from 'mathjs';
import {Subject} from 'rxjs/Subject';

type Operator = '*' | '-' | '+' | '/' | '=';

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.component.html',
  styleUrls: ['./calculator.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalculatorComponent implements OnDestroy {
  result$: Observable<string>;
  resultSubj = new BehaviorSubject<string>('');
  numberInputSubj = new Subject<number>();
  operatorInputSubj = new Subject<Operator>();
  dotInputSubj = new Subject<Dot>();
  @HostBinding() tabindex = 1;
  private _subs: Array<Subscription> = [];
  private _captureKey$: Observable<string> = createCaptureKey$(this._elRef.nativeElement).publishReplay(1).refCount();

  constructor(private _elRef: ElementRef) {
    this._subs.push(
      this._createExpression$().subscribe(),
      this._deleteInputOnTriggers().subscribe(),
      createPreventEnterKeydown$(this._elRef.nativeElement).subscribe()
    );
    this.result$ = this.resultSubj.asObservable().map(expressionToInputString);
    this.numberInputSubj.next(0);
  }

  ngOnDestroy() {
    this._subs.forEach(sub => sub.unsubscribe());
  }

  private _deleteInputOnTriggers = (): Observable<any> =>
    this._captureKey$
      .filter(key => (key === 'Backspace' || key === 'Delete') && this.resultSubj.value.length > 0)
      .withLatestFrom(this.resultSubj)
      .do(([_, result]) => this.resultSubj.next(result.length === 1 ? '0' : result.slice(0, result.length - 1)))

  private _createExpression$ = (): Observable<string> =>
    this._updateExpressionOnTriggers()
      .do(val => this.resultSubj.next(val))
      .distinctUntilChanged()

  private _updateExpressionWithNewNumber = (): Observable<string> =>
    this._captureNumbersOnTriggers()
      .withLatestFrom(this.resultSubj)
      .map(([newNumber, result]) => {
        const lastNumberAsStringFromExpression = pluckLastNumberAsStringFromExpression(result);
        const lastCharOfResult = getLastCharOfString(result);
        return (
          parseFloat(lastNumberAsStringFromExpression) === 0 &&
          !isFloat(lastNumberAsStringFromExpression) &&
          isNumber(parseInt(lastCharOfResult, 10))
        ) ?
          result.substr(0, result.length - 1) + newNumber :
          result + newNumber;
      })

  private _updateExpressionOnNewOperator = (): Observable<string> =>
    this._captureOperatorsOnTriggers$()
      .withLatestFrom(this.resultSubj)
      .map(([newOperator, result]) => {
        if (newOperator === '=') {
          try {
            return mathEval(result).toString();
          } catch (err) {
            return result;
          }
        } else {
          return updateLatestOperator(getLastCharOfString(result) === dot ? result + '0' : result, newOperator);
        }
      })

  private _updateExpressionOnNewDot = (): Observable<string> =>
    Observable.merge(
      this._captureDotOnTriggers$(),
      this.dotInputSubj
    )
      .withLatestFrom(this.resultSubj)
      .map(([_, expression]) =>
        canAppendDotInExpression(expression) ?
          (lastInputIsOperator(expression) ? expression + '0' + dot : expression + dot) :
          expression
      )

  private _updateExpressionOnTriggers = (): Observable<string> =>
    Observable.merge(
      this._updateExpressionWithNewNumber(),
      this._updateExpressionOnNewOperator(),
      this._updateExpressionOnNewDot()
    )

  private _captureNumbersOnTriggers = (): Observable<string> =>
    Observable.merge(
      this._captureKey$.map(key => parseInt(key, 10)).filter(isNumber),
      this.numberInputSubj
    )

  private _captureOperatorsOnTriggers$ = (): Observable<Operator> =>
    Observable.merge(
      <Observable<Operator>>this._captureKey$.map(key => key === 'Enter' ? '=' : key).filter(isOperator),
      this.operatorInputSubj
    )

  private _captureDotOnTriggers$ = (): Observable<Dot> =>
    <Observable<Dot>>this._captureKey$.map(key => key === ',' ? dot : key).filter(val => val === dot)
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
  return isOperator(getLastCharOfString(expression));
}

function getLastCharOfString(str: string): string {
  return str.substr(str.length - 1);
}

function updateLatestOperator(expression: string, newOperator: Operator): string {
  if (expression === '' && newOperator !== '+' && newOperator !== '-') {
    return expression;
  }
  return (
    lastInputIsOperator(expression) ?
      expression.substr(0, expression.length - 1) + newOperator :
      expression + newOperator
  );
}

function pluckLastNumberAsStringFromExpression(expression: string): string {
  const res = expression.match(lastNumberPattern);
  return (
    !!res ?
      res[1] :
      null
  );
}

function expressionToInputString(expression: string): string {
  let input = expression.replace(new RegExp('\\*', 'g'), '&times;');
  input = input.replace(new RegExp('\\/', 'g'), '&divide;');
  return input;
}

function createPreventEnterKeydown$(element): Observable<KeyboardEvent> {
  return Observable.fromEvent(element, 'keydown')
    .filter((e: any) => e.key === 'Enter')
    .do((e: any) => e.preventDefault());
}

function canAppendDotInExpression(expression: string): boolean {
  const lastExpressionChar = getLastCharOfString(expression);
  return (
    isOperator(lastExpressionChar) ||
    isNumber(parseInt(lastExpressionChar, 10)) &&
    !isFloat(pluckLastNumberAsStringFromExpression(expression))
  );
}

function isFloat(param: number | string): boolean {
  if (typeof param === 'string') {
    return param.indexOf('.') !== -1;
  } else {
    return Number(param) === param && param % 1 !== 0;
  }
}

const lastNumberPattern = /(\d+(\.\d+)?)(?!.*\d)/;
type Dot = '.';
const dot: Dot = '.';
