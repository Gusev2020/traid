export class ErrorResponseDto {
  statusCode!: number;
  code!: string;
  message!: string;
  path!: string;
  requestId?: string;
  timestamp!: string;
}
