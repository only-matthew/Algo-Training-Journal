#include<iostream>
#include<algorithm>
using namespace std;
struct cow
{
    int p,a;
}b[5010];
bool cmp(cow x,cow y)
{
    return x.p<y.p;
}
int main()
{
    int n,m;
    cin>>n>>m;
    for(int i=1;i<=m;i++)cin>>b[i].p>>b[i].a;
    sort(b+1,b+m+1,cmp);
    long long ans=0;
    for(int i=1;i<=m;i++)
    {
        if(n>=b[i].a)
        {
            ans+=b[i].p*b[i].a;
            n-=b[i].a;
        }
        else
        {
            ans+=b[i].p*n;
            break;
        }
    }
    cout<<ans<<endl;
    return 0;
}