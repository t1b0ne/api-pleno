import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AgentService } from './agent.service';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import { AnalyzeTaskDto } from './dto/analyze-task.dto';
import { ApplyAnalysisDto } from './dto/apply-analysis.dto';

@ApiTags('Agent')
@ApiBearerAuth('google-token')
@Controller('v1/agent/tasks')
@UseGuards(GoogleAuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get(':taskId')
  @ApiOperation({ summary: 'Obtener una tarea para analizarla con el agente' })
  @ApiParam({ name: 'taskId', description: 'ID del documento de Convex' })
  @ApiResponse({ status: 200, description: 'Tarea obtenida correctamente.' })
  @ApiResponse({ status: 401, description: 'Access Token de Google faltante o inválido.' })
  async getTask(@Param('taskId') taskId: string, @Req() req: any) {
    return this.agentService.getTask(taskId, this.getUserId(req));
  }

  @Post(':taskId/analyze')
  @ApiOperation({ summary: 'Analizar una tarea con el agente eve sin guardar el análisis' })
  @ApiParam({ name: 'taskId', description: 'ID del documento de Convex' })
  @ApiResponse({ status: 200, description: 'Análisis generado correctamente.' })
  @ApiResponse({ status: 401, description: 'Access Token de Google faltante o inválido.' })
  async analyzeTask(
    @Param('taskId') taskId: string,
    @Body() dto: AnalyzeTaskDto,
    @Req() req: any,
  ) {
    return this.agentService.analyzeTask(taskId, this.getUserId(req), dto);
  }

  @Patch(':taskId/apply-analysis')
  @ApiOperation({ summary: 'Aplicar el análisis confirmado sobre la tarea' })
  @ApiParam({ name: 'taskId', description: 'ID del documento de Convex' })
  @ApiResponse({ status: 200, description: 'Análisis aplicado correctamente.' })
  @ApiResponse({ status: 401, description: 'Access Token de Google faltante o inválido.' })
  async applyAnalysis(
    @Param('taskId') taskId: string,
    @Body() dto: ApplyAnalysisDto,
    @Req() req: any,
  ) {
    return this.agentService.applyAnalysis(
      taskId,
      this.getUserId(req),
      dto.confirmed,
      dto.priority,
      dto.status,
      dto.importanceScore,
    );
  }

  private getUserId(req: any): string {
    const user = req.user || req.googleUser;
    const userId = user?.sub || user?.email;

    if (!userId) {
      throw new UnauthorizedException('No se pudo identificar al usuario de Google.');
    }

    return userId;
  }
}
