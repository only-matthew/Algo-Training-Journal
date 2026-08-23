#include<iostream>
using namespace std;
long long f[25][25];
bool a[25][25];
int delx[9]={0,1,1,2,2,-1,-1,-2,-2};
int dely[9]={0,2,-2,1,-1,2,-2,1,-1};
int main()
{
    int n,m,x,y;
    cin>>n>>m>>x>>y;
    for(int i=0;i<9;i++)
    {
        int nx=x+delx[i];
        int ny=y+dely[i];
        if(nx>=0&&nx<=n&&ny>=0&&ny<=m)
        {
            a[nx][ny]=true;
        }
    }
    f[0][0]=1;
    for(int i=0;i<=n;i++)
    {
        for(int j=0;j<=m;j++)
        {
            if(a[i][j])
            {
                f[i][j]=0;continue;
            }
            if(i>0)f[i][j]+=f[i-1][j];
            if(j>0)f[i][j]+=f[i][j-1];
        }
    }
    cout<<f[n][m]<<endl;
    return 0;
}