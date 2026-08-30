import { Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import { PlannerService } from './planner.service';

@ApiTags('Planner')
@ApiBearerAuth('google-token')
@Controller('v1/planner')
@UseGuards(GoogleAuthGuard)
export class PlannerController {
  constructor(private readonly plannerService: PlannerService) {}

  @Get('critical-path')
  @ApiOperation({ summary: 'Calcular dependencias y ruta crítica de las tareas pendientes' })
  async criticalPath(@Req() req: any) {
    const user = req.user || req.googleUser;
    const userId = user?.sub || user?.email;
    if (!userId) throw new UnauthorizedException('No se pudo identificar al usuario de Google.');
    return this.plannerService.criticalPath(userId);
  }

  @Post('weekly-plan')
  @ApiOperation({ summary: 'Generar y guardar el plan semanal de estudio' })
  async weeklyPlan(@Req() req: any) {
    const user = req.user || req.googleUser;
    const userId = user?.sub || user?.email;
    if (!userId) throw new UnauthorizedException('No se pudo identificar al usuario de Google.');
    return this.plannerService.generateWeeklyPlan(userId);
  }

}
