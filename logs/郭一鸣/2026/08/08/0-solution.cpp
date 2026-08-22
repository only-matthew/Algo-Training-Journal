#include<iostream>
#include<algorithm>
#include<cmath>
#include<cstdio>
using namespace std;
struct pt
{
    int x,y,z;
}a[50010];
bool cmp(pt x,pt y)
{
    return x.z<y.z;
}
int main()
{
    int n;
    cin>>n;
    for(int i=1;i<=n;i++)cin>>a[i].x>>a[i].y>>a[i].z;
    sort(a+1,a+n+1,cmp);
    double ans=0;
    for(int i=2;i<=n;i++)
    {
        int dx=a[i].x-a[i-1].x;
        int dy=a[i].y-a[i-1].y;
        int dz=a[i].z-a[i-1].z;
        ans+=sqrt((double)dx*dx+(double)dy*dy+(double)dz*dz);
    }
    printf("%.3f\n",ans);
    return 0;
}