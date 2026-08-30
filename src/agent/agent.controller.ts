import { Body, Controller, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import { AnalysisService } from '../analysis/analysis.service';
import { PlannerService } from '../planner/planner.service';

@ApiTags('Agent')
@ApiBearerAuth('google-token')
@Controller('v1/agent/tasks')
@UseGuards(GoogleAuthGuard)
export class AgentController {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly plannerService: PlannerService,
  ) {}

  @Post('analyze-batch')
  @ApiOperation({ summary: 'Analizar en una sola llamada las tareas pendientes del usuario' })
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  async analyzeBatch(@Req() req: any, @Query('force') force?: string, @Body() body?: { force?: boolean }) {
    return this.analysisService.analyzeTaskBatch(this.getUserId(req), force === 'true' || body?.force === true);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Actualizar análisis, ruta crítica y plan después de cambios en tareas' })
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  async refresh(@Req() req: any, @Query('force') force?: string) {
    const userId = this.getUserId(req);
    const analysis = await this.analysisService.analyzeSummary(userId, force === 'true');
    const plan = await this.plannerService.generateWeeklyPlan(userId);
    return { success: true, analysis, criticalPath: plan.data.criticalPath, plan: plan.data };
  }

  @Post('agentemasresumen')
  @ApiOperation({ summary: 'Analizar el resumen determinista junto con el perfil del usuario' })
  async agenteMasResumen(@Req() req: any) {
    return this.analysisService.analyzeSummary(this.getUserId(req));
  }

  private getUserId(req: any): string {
    const user = req.user || req.googleUser;
    const userId = user?.sub || user?.email;
    if (!userId) throw new UnauthorizedException('No se pudo identificar al usuario de Google.');
    return userId;
  }
}
